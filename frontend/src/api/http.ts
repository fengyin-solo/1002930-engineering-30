/**
 * 全局唯一的请求实现。所有页面（以及直接用 fetch 的老代码）都从这里走：
 *
 * - 身份只从 session store 一处取，退出后立即失效，并取消所有在途请求；
 * - 超时 / 断网 / HTTP 异常 / 业务异常（响应体 ok:false）分档归类；
 * - 同 tag 的新请求会顶掉旧请求（搜索、翻页场景从最新一次接着取）；
 * - 同动作并发提交按 key 合并，只真正放行一次；
 * - 每次失败都登记到 notice store，页面上拿到的原因是同一份，可统一重试 / 取消。
 */
import { useSessionStore } from '@/stores/session'
import { useNoticeStore, type NoticeKind } from '@/stores/notice'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''
/** 默认超时 10s，可用 VITE_HTTP_TIMEOUT 覆盖（本地开发约定见 README）。 */
export const DEFAULT_TIMEOUT = Number(import.meta.env.VITE_HTTP_TIMEOUT ?? 10000)

/** 错误分档：页面可据此决定提示样式与是否允许重试。 */
export type ErrorKind = 'timeout' | 'offline' | 'http' | 'business' | 'aborted'

/** 标记一次“被新请求顶替”的中断：静默处理，不进错误提示。 */
const SUPERSEDE_REASON = 'superseded-by-newer-request'

export class ApiError extends Error {
  readonly kind: ErrorKind
  /** HTTP 状态码；超时 / 断网 / 业务异常时可能为空。 */
  readonly status?: number
  /** 是否建议页面给出“重试”入口（业务校验失败不重试）。 */
  readonly retryable: boolean
  /** 登记到 notice 里的请求标签，重试 / 取消都靠它。 */
  tag?: string

  constructor(kind: ErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.retryable = kind === 'timeout' || kind === 'offline' || kind === 'http'
  }
}

export interface RequestOptions extends Omit<RequestInit, 'signal'> {
  /** 超时毫秒数，默认取 DEFAULT_TIMEOUT；传 0 表示不设超时。 */
  timeout?: number
  /**
   * 请求标签：相同 tag 的旧请求会被新请求顶替（取消并静默），
   * 同时作为失败登记 / 重试 / 取消的唯一标识。
   */
  tag?: string
  /**
   * 动作合并键：相同 key 的非 GET 并发请求只真正发送一次，其余复用结果。
   * 默认按 `方法+地址+请求体` 生成；显式传 null 可关闭合并。
   */
  dedupeKey?: string | null
  /** 失败提示的来源（模块名），用于区分原因发生在哪个页面。 */
  source?: string
  /** 关联一个外部 AbortSignal（如组件卸载）。 */
  signal?: AbortSignal
}

type InflightEntry = {
  controller: AbortController
  responsePromise: Promise<Response>
  /** 同动作复用方的扇出槽：响应到达时统一 clone，错误时统一透传。 */
  fanout: { resolve: (r: Response) => void; reject: (e: unknown) => void }[]
}

/** 登记一个同动作复用方，返回它专属的响应 Promise（只真正发一次请求）。 */
function joinInflight(entry: InflightEntry, tag: string | undefined): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    entry.fanout.push({ resolve, reject })
    if (tag) {
      inflightByTag.set(tag, entry)
      void entry.responsePromise.finally(() => inflightByTag.delete(tag))
    }
  })
}

/** tag -> 在途请求：顶替、取消、重试状态查询都查这张表。 */
const inflightByTag = new Map<string, InflightEntry>()
/** 动作合并键 -> 在途请求：同动作并发只放行一次。 */
const inflightByAction = new Map<string, InflightEntry>()
/** tag -> 最近一次请求描述：重试时按断掉那次的入参原样重发。 */
const lastAttemptByTag = new Map<string, { path: string; options: RequestOptions }>()
/** tag -> 重试处理器：页面可以把“成功后刷新列表”等收尾一并挂上来。 */
const retryHandlers = new Map<string, () => void>()

export function hasInflight(tag: string): boolean {
  return inflightByTag.has(tag)
}

type InflightListener = (tag: string, active: boolean) => void
const inflightListeners = new Set<InflightListener>()

/** 订阅某 tag 在途 / 结束事件，供 UI 切换“取消”按钮。 */
export function onInflightChange(listener: InflightListener): () => void {
  inflightListeners.add(listener)
  return () => inflightListeners.delete(listener)
}

function emitInflight(tag: string | undefined, active: boolean): void {
  if (!tag) return
  inflightListeners.forEach((listener) => listener(tag, active))
}

/** 登记某个 tag 的重试处理器（页面级收尾逻辑走这里）。 */
export function registerRetryHandler(tag: string, handler: () => void): void {
  retryHandlers.set(tag, handler)
}

export function unregisterRetryHandler(tag: string): void {
  retryHandlers.delete(tag)
}

/**
 * 统一重试：优先走页面登记的处理器；没有则按断掉那次的入参原样重发。
 * 返回 false 表示没有可重试的记录。
 */
export function retry(tag: string): boolean {
  const handler = retryHandlers.get(tag)
  if (handler) {
    handler()
    return true
  }
  const attempt = lastAttemptByTag.get(tag)
  if (attempt) {
    void request(attempt.path, attempt.options)
    return true
  }
  return false
}

function resolveUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_BASE}${path}`
}

function buildHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  // 身份只从 session store 这一处取，页面不允许自行拼装。
  const token = useSessionStore().token
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

/** 用户主动取消某个 tag 的请求，并给出一条统一提示。 */
export function cancel(tag: string, source?: string): boolean {
  const found = cancelByTag(tag, false)
  if (found) {
    useNoticeStore().push({ kind: 'info', text: '已取消本次请求', tag, source })
  }
  return found
}

/** 取消某个 tag 在途的请求（取消走与超时同一套 AbortController 机制）。 */
export function cancelByTag(tag: string, silent = false): boolean {
  const entry = inflightByTag.get(tag)
  if (!entry) return false
  inflightByTag.delete(tag)
  entry.controller.abort(silent ? undefined : { canceledByUser: true })
  return true
}

/** 退出登录时调用：取消全部在途请求，此后请求头不再带旧身份。 */
export function cancelAllRequests(): void {
  for (const [, entry] of inflightByTag) {
    entry.controller.abort({ loggedOut: true })
  }
  inflightByTag.clear()
  inflightByAction.clear()
}

function isOfflineFailure(error: unknown): boolean {
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    (error instanceof TypeError && /fetch|network|failed to fetch/i.test(error.message))
  )
}

function isSilentAbort(reason: unknown): boolean {
  return (
    reason === SUPERSEDE_REASON ||
    (typeof reason === 'object' &&
      reason !== null &&
      ((reason as Record<string, unknown>).superseded === true ||
        (reason as Record<string, unknown>).loggedOut === true))
  )
}

async function readBusinessMessage(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.clone().json()) as { message?: unknown; detail?: unknown }
    const message = data.message ?? data.detail
    return typeof message === 'string' && message.trim() ? message.trim() : undefined
  } catch {
    return undefined
  }
}

function reportFailure(error: ApiError, source?: string): void {
  useNoticeStore().push({
    kind: 'error',
    text: error.message,
    tag: error.tag,
    source,
    retryable: error.retryable,
  })
}

/**
 * 统一请求内核。非 2xx 一律抛 ApiError（老代码里“非 200 当成功继续走”的路径被堵死）。
 */
export function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const {
    timeout = DEFAULT_TIMEOUT,
    tag,
    dedupeKey,
    source,
    signal: externalSignal,
    ...init
  } = options

  const method = (init.method ?? 'GET').toUpperCase()
  // 默认按“方法 + 完整路径 + 请求体”识别同一动作：不同 id 的动作不会被误合并。
  const actionKey =
    dedupeKey === null
      ? null
      : dedupeKey ??
        (method !== 'GET' ? `${method} ${resolveUrl(path)} ${init.body ?? ''}` : null)

  // 同动作并发：已经有一个在途，挂到同一请求的扇出队列，不重复放行。
  if (actionKey && inflightByAction.has(actionKey)) {
    return joinInflight(inflightByAction.get(actionKey)!, tag)
  }

  // GET 同 tag 的旧请求被新请求顶替：旧的那次静默中断，列表只以最新一次结果为准。
  if (tag && method === 'GET') {
    const previous = inflightByTag.get(tag)
    if (previous) {
      inflightByTag.delete(tag)
      previous.controller.abort(SUPERSEDE_REASON)
    }
  }

  const controller = new AbortController()
  const fanout: InflightEntry['fanout'] = []
  const entry: InflightEntry = { controller, responsePromise: null as never, fanout }

  if (tag) {
    // 留档：重试时从断掉那次的地址与入参接着取。
    lastAttemptByTag.set(tag, { path, options: { ...options, signal: undefined } })
  }
  const onExternalAbort = () =>
    controller.abort(externalSignal?.reason ?? { canceledByUser: true })
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  if (timeout > 0) {
    timer = setTimeout(() => controller.abort({ timeout: true }), timeout)
  }

  const responsePromise = (async (): Promise<Response> => {
    let response: Response
    try {
      response = await fetch(resolveUrl(path), {
        ...init,
        headers: buildHeaders(init.headers),
        signal: controller.signal,
      })
    } catch (error) {
      const reason = controller.signal.reason
      if (isSilentAbort(reason)) {
        // 顶替 / 退出导致的中断：不提示、不重试。
        throw new ApiError('aborted', '请求已取消')
      }
      if (controller.signal.aborted) {
        const isTimeout = typeof reason === 'object' && reason !== null && reason.timeout === true
        const apiError = isTimeout
          ? new ApiError('timeout', `请求超时（${Math.round(timeout)} 毫秒未响应），可重试`)
          : new ApiError('aborted', '请求已取消')
        if (!isTimeout) throw apiError
        apiError.tag = tag
        reportFailure(apiError, source)
        throw apiError
      }
      const kind: ErrorKind = isOfflineFailure(error) ? 'offline' : 'http'
      const apiError = new ApiError(
        kind,
        kind === 'offline'
          ? '网络已断开，请求未送达；恢复后可从这次失败继续重试'
          : `接口请求失败：${error instanceof Error ? error.message : '未知网络错误'}`,
      )
      apiError.tag = tag
      reportFailure(apiError, source)
      throw apiError
    } finally {
      if (timer) clearTimeout(timer)
      if (tag) {
        if (inflightByTag.get(tag) === entry) inflightByTag.delete(tag)
        emitInflight(tag, false)
      }
      if (actionKey && inflightByAction.get(actionKey) === entry) {
        inflightByAction.delete(actionKey)
      }
      externalSignal?.removeEventListener('abort', onExternalAbort)
    }

    if (!response.ok) {
      // 401：身份失效（含退出后旧令牌被拒），统一回到登录页。
      if (response.status === 401) {
        const session = useSessionStore()
        if (session.isAuthenticated) session.handleExpired()
        const apiError = new ApiError('http', '登录状态已失效，请重新登录', 401)
        apiError.tag = tag
        throw apiError
      }
      const detail = await readBusinessMessage(response)
      const apiError = new ApiError(
        'http',
        detail ?? `服务暂不可用（HTTP ${response.status}），数据未更新，可重试`,
        response.status,
      )
      apiError.tag = tag
      reportFailure(apiError, source)
      throw apiError
    }
    // 本次请求成功：若该 tag 此前留有失败原因，统一撤下（重试成功即消除）。
    if (tag) useNoticeStore().clear(tag)
    // 同动作复用方各拿一份独立响应体；必须在首个调用方消费 body 前 clone。
    for (const waiter of entry.fanout.splice(0)) waiter.resolve(response.clone())
    return response
  })()

  // 先把承诺落到 entry：同步发起的同动作复用方会立刻读取它。
  entry.responsePromise = responsePromise
  // 失败也要扇出给全部复用方（各自的 fetchJson 会收到同一个 ApiError）。
  responsePromise.catch((error) => {
    for (const waiter of entry.fanout.splice(0)) waiter.reject(error)
  })

  if (tag) {
    inflightByTag.set(tag, entry)
    emitInflight(tag, true)
  }
  if (actionKey) inflightByAction.set(actionKey, entry)

  return responsePromise
}

/** 解析 JSON；同时识别业务异常（HTTP 200 但响应体 ok:false）。 */
export async function parseJson<T>(response: Response, tag?: string, source?: string): Promise<T> {
  const data = (await response.json()) as T & { ok?: boolean; message?: string }
  if (data !== null && typeof data === 'object' && 'ok' in data && data.ok === false) {
    const apiError = new ApiError(
      'business',
      typeof data.message === 'string' && data.message.trim()
        ? data.message
        : '业务处理未通过，请核对后再提交',
    )
    apiError.tag = tag
    reportFailure(apiError, source)
    throw apiError
  }
  return data
}

/** 便捷方法：发请求并解析 JSON，业务异常（ok:false）同样抛出。 */
export async function fetchJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(path, options)
  return parseJson<T>(response, options.tag, options.source)
}

/** 便捷方法：提交 JSON 动作并解析结果；同动作并发默认只放行一次。 */
export async function postJson<T>(
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  return fetchJson<T>(path, {
    ...options,
    method: options.method ?? 'POST',
    body: options.body ?? JSON.stringify(body),
  })
}

/** 判断错误是否为请求被取消（页面可静默，不清数据、不报红）。 */
export function isAbortError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'aborted'
}

/** 下载类请求（如导出）：同样带身份、可取消、失败走统一提示。 */
export async function download(path: string, options: RequestOptions = {}): Promise<Blob> {
  const response = await request(path, options)
  return response.blob()
}

/** 把一条提示推到全局（页面间读到的是同一份原因）。 */
export function notify(kind: NoticeKind, text: string, source?: string): void {
  useNoticeStore().push({ kind, text, source })
}
