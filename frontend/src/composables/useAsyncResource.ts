/**
 * 页面与请求层之间的标准接法：
 * - loading / error / data 三态，错误原因统一写进 notice store，页面只负责回显；
 * - retry 与 cancel 复用同一个 AbortController，取消后再重试会发新请求；
 * - run 自带同一动作的并发去重（in-flight 时直接复用，不重复放行）；
 * - 组件卸载自动取消在途请求；退出登录由请求层统一取消。
 */
import { onBeforeUnmount, ref, shallowRef } from 'vue'

import { postJson, request, type RequestOptions } from '@/api/client'
import { ApiError, describeError, isApiError } from '@/api/errors'
import { useNoticeStore } from '@/stores/notice'

export interface ResourceState<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
  reason: string
}

export function useAsyncResource<T>(noticeKey: string) {
  const notices = useNoticeStore()
  const data = shallowRef<T | null>(null)
  const loading = ref(false)
  const error = shallowRef<ApiError | null>(null)
  const reason = ref('')

  let controller: AbortController | null = null

  function fail(err: unknown) {
    const apiError = isApiError(err) ? err : null
    error.value = apiError
    reason.value = notices.fail(noticeKey, err)
  }

  function clearError() {
    error.value = null
    reason.value = ''
    notices.clear(noticeKey)
  }

  async function run(
    loader: (signal: AbortSignal) => Promise<T>,
    options: { resetOnStart?: boolean } = {},
  ): Promise<T | null> {
    // 同一动作仍在途：只放行一次，直接复用这一次，不重复提交
    if (loading.value) return null
    if (controller) controller.abort()
    controller = new AbortController()
    loading.value = true
    if (options.resetOnStart ?? true) {
      data.value = null
      clearError()
    }
    try {
      const result = await loader(controller.signal)
      data.value = result
      return result
    } catch (err) {
      if (isApiError(err) && err.kind === 'aborted') {
        // 主动取消不作为错误回显
        return null
      }
      fail(err)
      return null
    } finally {
      loading.value = false
    }
  }

  /** 按上一次的加载方式重发；调用方把加载函数传进来即可（重试与取消同一套信号机制）。 */
  function retryWith(loader: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    return run(loader)
  }

  /** 取消当前在途请求（取消与重试共用同一个控制器机制）。 */
  function cancel() {
    controller?.abort()
    controller = null
    loading.value = false
  }

  onBeforeUnmount(cancel)

  return { data, loading, error, reason, run, retryWith, cancel, clearError, describeError }
}

/** 动作提交：同一 actionKey 并发只放行一次，{ok:false} 走业务异常档。 */
export function useActionSubmit<T = unknown>(noticeKey: string) {
  const submitting = ref(false)
  const notices = useNoticeStore()
  const reason = ref('')
  let inflight: Promise<T> | null = null

  async function submit(
    url: string,
    body?: unknown,
    options: RequestOptions & { actionKey?: string } = {},
  ): Promise<{ ok: boolean; data: T | null; reason: string }> {
    // 同一个动作并发提交：只放行一次，复用同一个请求结果
    if (inflight) {
      const data = await inflight
      return { ok: true, data, reason: '' }
    }
    submitting.value = true
    reason.value = ''
    const { actionKey, ...rest } = options
    const dedupeKey = actionKey ?? `POST ${url}`
    const task = postJson<T>(url, body, { dedupeKey, ...rest })
    inflight = task
    try {
      const data = await task
      return { ok: true, data, reason: '' }
    } catch (err) {
      reason.value = notices.fail(noticeKey, err)
      return { ok: false, data: null, reason: describeError(err) }
    } finally {
      if (inflight === task) inflight = null
      submitting.value = false
    }
  }

  return { submitting, reason, submit }
}

export { request }
