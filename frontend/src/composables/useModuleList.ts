/**
 * 列表页标准接法，底下是 ResumableList：
 * - reload(query) 按筛选条件从第一页拉；失败保留旧数据并写统一原因；
 * - loadMore() 从断掉的那次接着取（游标停在没取到的页）；
 * - retry/resume 与取消共用同一套信号；
 * - 原因写 notice store，同 noticeKey 在任何页面读到的都是同一份。
 */
import { onBeforeUnmount, ref, computed } from 'vue'

import { ResumableList } from '@/api/resumable'
import { ApiError, isApiError } from '@/api/errors'
import { useNoticeStore } from '@/stores/notice'

export function useModuleList<T = Record<string, string | number | null>>(
  endpoint: string,
  options: { noticeKey: string; pageSize?: number } = { noticeKey: endpoint },
) {
  const notices = useNoticeStore()
  const pageSize = options.pageSize ?? 20

  const rows = ref<T[]>([])
  const total = ref(0)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<ApiError | null>(null)
  const reason = ref('')
  const hasMore = ref(false)

  let loader = new ResumableList<T>(endpoint, { pageSize })
  let controller: AbortController | null = null
  // 重新加载前取消上一轮（退出登录由请求层统一取消）
  function newController(): AbortSignal {
    controller?.abort()
    controller = new AbortController()
    return controller.signal
  }

  function sync(pullMore: boolean) {
    const state = loader.state
    rows.value = state.items
    total.value = state.total
    error.value = state.error
    hasMore.value = loader.hasNext()
    if (!state.error) {
      reason.value = ''
      notices.clear(options.noticeKey)
    }
    loading.value = !pullMore && state.loading
    loadingMore.value = pullMore
  }

  async function reload(query: Record<string, string | number | undefined | null> = {}) {
    const signal = newController()
    loading.value = true
    loadingMore.value = false
    error.value = null
    reason.value = ''
    notices.clear(options.noticeKey)
    loader = new ResumableList<T>(endpoint, { pageSize, query })
    try {
      await loader.loadNext(signal)
    } catch (err) {
      if (isApiError(err) && err.kind === 'aborted') return
      reason.value = notices.fail(options.noticeKey, err)
    } finally {
      sync(false)
    }
  }

  /** 接着取：失败后再调只发断掉的那一页；没失败时正常翻下一页。 */
  async function loadMore() {
    if (!loader.hasNext() || loadingMore.value) return
    const signal = newController()
    loadingMore.value = true
    try {
      await loader.resume(signal)
    } catch (err) {
      if (isApiError(err) && err.kind === 'aborted') return
      reason.value = notices.fail(options.noticeKey, err)
    } finally {
      sync(true)
    }
  }

  /** 从断掉的那次重试，语义同 loadMore，供「重试」按钮调用。 */
  const resume = loadMore

  function cancel() {
    controller?.abort()
    controller = null
    loading.value = false
    loadingMore.value = false
  }

  onBeforeUnmount(cancel)

  return {
    rows,
    total,
    loading,
    loadingMore,
    error,
    reason,
    hasMore: computed(() => hasMore.value),
    reload,
    loadMore,
    resume,
    cancel,
  }
}
