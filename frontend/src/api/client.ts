/**
 * 全站唯一的请求实现。
 *
 * - 身份只从 identity 取：每次请求即时读取当前令牌，退出后不再带旧身份，
 *   401 会走同一条失效路径；
 * - 超时 / 断网 / HTTP 异常 / 业务异常分档（见 errors.ts），原因统一可回显；
 * - 断网、超时、5xx、429 自动重试（指数退避），重试与主动取消共用同一个
 *   AbortController，退出登录会取消全部在途请求；
 * - inflight 去重：完全相同的 GET 并发只发一次；带 dedupeKey 的提交
 *   （同一个动作）并发也只放行一次，其他调用复用同一个结果。
 */
import {
  abortedError,
  ApiError,
  businessError,
  extractReason,
  httpError,
  isApiError,
  offlineError,
  timeoutError,
} from './errors'
import { getIdentity, invalidate as invalidateIdentity, onInvalidate } from './identity'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const DEFAULT_TIMEOUT = Number(import.meta.env.VITE_HTTP_TIMEOUT ?? 10000)
const DEFAULT_RETRIES = Number(import.meta.env.VITE_HTTP_RETRIES ?? 2)

export interface RequestOptions extends Omit<RequestInit, 'signal'> {
  /** 毫秒，默认取 VITE_HTTP_TIMEOUT（10s）。 */
  timeout?: number
  /** 可重试错误的额外重试次数，默认取 VITE_HTTP_RETRIES（2）；0 表示不重试。 */
  retries?: number
  /** 页面侧取消信号；与内部超时、登出广播的信号合并。 */
  signal?: AbortSignal
  /** 相同 key 的并发请求只放行一次（常用于按钮连点），默认 GET 按 方法+URL+请求体 去重。 */
  dedupeKey?: string
  /** 设为 false 可强制发一次新请求，跳过 inflight 合并。 */
  dedupe?: boolean
}

interface InflightEntry {
  /** 首个调用方拿原始响应；随后加入的调用方各拿一份 clone（在响应落定瞬间统一克隆）。 */
  promise: Promise<{ response: Response; clones: Response[] }>
  /** 实际请求自己的控制器：用于退出登录时取消全部在途请求。 */
  controller: AbortController
  /** 加入这一在途请求的调用方数量（含首调用方）。 */
  refs: number
}

const inflight = new Map<string, InflightEntry>()

// 退出登录：取消全部在途请求；后续请求由 getIdentity 保证不带旧令牌。
onInvalidate(() => {
  for (const entry of inflight.values()) entry.controller.abort()
  inflight.clear()
})

function withBase(path: string): string {
  return path.startsWith('http') ? path : `${API_BASE}${path}`
}

function isAbortReason(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

/** 把页面信号、超时、内部控制器串到同一个 abort 上。 */
function linkSignals(controller: AbortController, timeoutMs: number, external?: AbortSignal): () => void {
  const timers: ReturnType<typeof setTimeout>[] = []
  const cleanups: Array<() => void> = []

  if (timeoutMs > 0) {
    timers.push(
      setTimeout(() => {
        if (!controller.signal.aborted) controller.abort(new DOMException('timeout', 'TimeoutError'))
      }, timeoutMs),
    )
  }

  if (external) {
    if (external.aborted) {
      controller.abort()
    } else {
      const onAbort = () => controller.abort()
      external.addEventListener('abort', onAbort, { once: true })
      cleanups.push(() => external.removeEventListener('abort', onAbort))
    }
  }

  return () => {
    timers.forEach(clearTimeout)
    cleanups.forEach((fn) => fn())
  }
}

async function parseErrorBody(response: Response): Promise<unknown> {
  try {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) return await response.json()
    return await response.text()
  } catch {
    return null
  }
}

async function rawFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Response> {
  // 每次尝试独立的控制器：超时只取消这一次；父信号（页面取消/退出）一断全部放弃。
  const controller = new AbortController()
  const unlink = linkSignals(controller, timeoutMs, parentSignal)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    unlink()
    if (!response.ok) {
      if (response.status === 401) {
        invalidateIdentity()
      }
      const body = await parseErrorBody(response)
      throw httpError(response.status, extractReason(body, `请求失败（${response.status}）`))
    }
    return response
  } catch (error) {
    unlink()
    if (isApiError(error)) throw error
    // 只要控制器信号已断，就是取消（页面取消/退出登录）或超时；
    // 不依赖各 fetch 实现给的 DOMException.name（undici 下可能为空）
    if (controller.signal.aborted) {
      // 取消优先：页面/退出信号一旦断了，即便与超时同时发生也按取消处理（不再重试）
      if (parentSignal?.aborted) throw abortedError()
      // 否则是本尝试自己的超时触发
      throw timeoutError()
    }
    if (isAbortReason(error)) throw abortedError()
    // fetch 网络层失败：断网、DNS、CORS 等
    throw offlineError()
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError())
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(abortedError())
      },
      { once: true },
    )
  })
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  retries: number,
  parentSignal?: AbortSignal,
): Promise<Response> {
  let attempt = 0
  for (;;) {
    try {
      return await rawFetch(url, init, timeoutMs, parentSignal)
    } catch (error) {
      const abortable = error instanceof ApiError && error.kind === 'aborted'
      const canRetry = !abortable && (error instanceof ApiError ? error.retryable : false) && attempt < retries
      if (!canRetry) throw error
      // 重试与取消同一套：退避期间页面取消或退出登录都会立即中断
      await wait(Math.min(300 * 2 ** attempt, 2000), parentSignal)
      attempt += 1
    }
  }
}

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  // 身份只从这一处取
  const identity = getIdentity()
  if (identity?.token) {
    headers.set('Authorization', `Bearer ${identity.token}`)
  }
  return headers
}

export function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const url = withBase(path)
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    signal,
    dedupe,
    dedupeKey,
    ...rest
  } = options

  const method = (rest.method ?? 'GET').toUpperCase()
  const shouldDedupe = dedupe ?? method === 'GET'
  const key = dedupeKey ?? `${method} ${url} ${typeof rest.body === 'string' ? rest.body : ''}`

  if (shouldDedupe) {
    const hit = inflight.get(key)
    if (hit) {
      // 复用同一个在途请求：加入方各拿一份克隆（在响应落定瞬间统一克隆，
      // 早于任何 body 消费），互不抢占
      hit.refs += 1
      return hit.promise.then(({ clones }) => clones.pop() as Response)
    }
  }

  // 外层控制器：串页面取消与退出登录广播；超时在每次尝试内部单独计时。
  const controller = new AbortController()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const init: RequestInit = { ...rest, method, headers: buildHeaders(rest) }
  // 首调用方先占位：响应落定时按 (refs-1) 一次性克隆完
  const entry: InflightEntry = { promise: null as never, controller, refs: 1 }
  entry.promise = fetchWithRetry(url, init, timeout, retries, controller.signal).then((response) => {
    const clones: Response[] = []
    for (let i = 1; i < entry.refs; i++) clones.push(response.clone())
    return { response, clones }
  })
  inflight.set(key, entry)
  // 一旦落定立即出表：去重只合并「在途」并发，不缓存结果，后续调用照常发新请求。
  // 这里挂一个空 catch：拒绝已由各调用方的 promise 接收，清理分支自身不应产生 unhandled rejection。
  void entry.promise.catch(() => {}).finally(() => inflight.delete(key))
  return entry.promise.then(({ response }) => response)
}

export interface JsonRequestOptions extends RequestOptions {
  /** 动作类接口 HTTP 200 + {ok:false} 时是否按业务异常抛出，默认 true。 */
  rejectBusinessFailure?: boolean
}

async function readJson<T>(response: Response): Promise<T> {
  // 204 或空响应
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** 兼容旧用法：fetchJson 仍然可用，行为升级为统一分档与重试。 */
export async function fetchJson<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
  const { rejectBusinessFailure = true, ...rest } = options
  const response = await request(path, rest)
  const data = await readJson<T>(response)
  if (rejectBusinessFailure && data && typeof data === 'object' && (data as { ok?: unknown }).ok === false) {
    const message = (data as { message?: unknown }).message
    throw businessError(typeof message === 'string' && message ? message : '操作未成功', 'BUSINESS_REJECTED')
  }
  return data
}

/** 提交型请求的便捷封装：同一动作并发只放行一次（调用方给同一个 dedupeKey）。 */
export function postJson<T>(path: string, body?: unknown, options: JsonRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers as HeadersInit | undefined)
  return fetchJson<T>(path, {
    // 提交默认开启去重：配合 dedupeKey/actionKey 实现同一动作并发只放行一次；
    // 明确不需要时传 dedupe:false
    dedupe: true,
    ...options,
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export { ApiError }
