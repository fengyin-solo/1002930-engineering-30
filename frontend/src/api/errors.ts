/**
 * 统一错误分档：超时、断网、HTTP 异常、业务异常、主动取消各自一类，
 * 页面上回显的原因统一从这里取，不再每个接口各写一句。
 */
export type ErrorKind = 'timeout' | 'offline' | 'http' | 'business' | 'aborted'

export interface ErrorDetail {
  /** 后端给出的原因（detail/message），没有时由分档兜底文案补齐。 */
  reason: string
  /** 后端返回的错误码（HTTP 状态码或业务码），便于排查。 */
  code?: number | string
}

export class ApiError extends Error {
  readonly kind: ErrorKind
  readonly code?: number | string
  /** 断网/超时/5xx 等可以安全重试；4xx 与业务拒绝默认不重试。 */
  readonly retryable: boolean

  constructor(kind: ErrorKind, message: string, opts: { code?: number | string; retryable?: boolean } = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.code = opts.code
    this.retryable = opts.retryable ?? false
  }

  /** 页面统一回显用的可读原因。 */
  get reason(): string {
    return this.message
  }
}

const FALLBACK_REASON: Record<Exclude<ErrorKind, 'aborted'>, string> = {
  timeout: '请求超时，服务暂时没有响应',
  offline: '网络已断开，请求没有送达，请检查连接后重试',
  http: '服务暂时不可用，请稍后重试',
  business: '操作未被服务接受',
}

/** 从后端错误体里取原因：FastAPI 的 {detail} 与业务的 {message} 都兼容。 */
export function extractReason(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const data = body as Record<string, unknown>
    if (typeof data.message === 'string' && data.message.trim()) return data.message
    if (typeof data.detail === 'string' && data.detail.trim()) return data.detail
  }
  if (typeof body === 'string' && body.trim()) return body
  return fallback
}

export function timeoutError(detail?: ErrorDetail): ApiError {
  return new ApiError('timeout', detail?.reason || FALLBACK_REASON.timeout, {
    code: detail?.code,
    retryable: true,
  })
}

export function offlineError(detail?: ErrorDetail): ApiError {
  return new ApiError('offline', detail?.reason || FALLBACK_REASON.offline, {
    code: detail?.code,
    retryable: true,
  })
}

export function abortedError(): ApiError {
  return new ApiError('aborted', '请求已取消')
}

export function httpError(status: number, reason: string): ApiError {
  const retryable = status >= 500 || status === 429
  return new ApiError('http', reason || `${FALLBACK_REASON.http}（${status}）`, {
    code: status,
    retryable,
  })
}

/** 动作接口返回 HTTP 200 但 {ok:false}：业务异常，原因取后端 message。 */
export function businessError(reason: string, code?: number | string): ApiError {
  return new ApiError('business', reason || FALLBACK_REASON.business, { code })
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** 统一回显文案：任何 catch 到的东西都能在页面上得到一句可读原因。 */
export function describeError(error: unknown): string {
  if (isApiError(error)) return error.reason
  if (error instanceof Error && error.message) return error.message
  return FALLBACK_REASON.http
}

export function isRetryable(error: unknown): boolean {
  return isApiError(error) ? error.retryable : false
}
