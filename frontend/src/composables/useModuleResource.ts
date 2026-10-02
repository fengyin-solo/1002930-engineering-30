import { computed, onBeforeUnmount, reactive, ref } from 'vue'

import {
  ApiError,
  cancel,
  cancelByTag,
  download,
  fetchJson,
  isAbortError,
  notify,
  postJson,
  registerRetryHandler,
  retry,
  unregisterRetryHandler,
} from '@/api/http'
import { useNoticeStore, type Notice } from '@/stores/notice'

type Row = Record<string, string | number | null>

interface PagePayload {
  items?: Row[]
  total?: number
}

interface ActionPayload {
  ok: boolean
  message: string
  entry?: Row
}

const LIST_TAG = 'list'

/**
 * 所有模块页共用的取数 / 提交实现：
 * - 列表请求同 tag 顶替（新的查询顶掉旧的，恢复时从最新一次接着取）；
 * - 行内动作并发提交只放行一次，提交中按钮禁用；
 * - 失败原因统一登记到 notice store，页脚与顶栏拿到同一份；
 * - 重试走 http.retry，取消走同一套 AbortController。
 */
export function useModuleResource(endpoint: string, source: string) {
  const notices = useNoticeStore()
  const rows = ref<Row[]>([])
  const total = ref(0)
  const filters = reactive<Record<string, string>>({})
  const loading = ref(false)
  const loadFailed = ref(false)
  const exporting = ref(false)
  const pendingActions = reactive(new Set<string>())

  let seq = 0

  const tagFor = (suffix = LIST_TAG) => `${endpoint}#${suffix}`
  const actionKeyOf = (row: Row, action: string) => `${row.id}#${action}`

  /** 本页列表相关的最新原因（顶栏 / 其它页面看到的是同一份 notices.latest）。 */
  const listNotice = computed<Notice | null>(() => {
    const latest = notices.latest
    return latest && latest.tag === tagFor() ? latest : null
  })

  function actionNotice(row: Row, action: string): Notice | null {
    const latest = notices.latest
    return latest && latest.tag === tagFor(actionKeyOf(row, action)) ? latest : null
  }

  async function load(): Promise<void> {
    const attempt = ++seq
    const tag = tagFor()
    loading.value = true
    loadFailed.value = false
    notices.clear(tag)
    const query = new URLSearchParams(filters).toString()
    try {
      const payload = await fetchJson<PagePayload>(`${endpoint}?${query}`, { tag, source })
      // 被更新的请求顶替过：结果已过期，丢弃，避免覆盖新数据。
      if (attempt !== seq) return
      rows.value = payload.items ?? []
      total.value = payload.total ?? rows.value.length
      unregisterRetryHandler(tag)
    } catch (error) {
      if (attempt === seq && !isAbortError(error)) {
        loadFailed.value = true
        rows.value = []
        total.value = 0
        // 失败后的“重试”就是重跑本函数，入参（筛选条件）保持断掉那次不变。
        registerRetryHandler(tag, () => void load())
      }
    } finally {
      if (attempt === seq) loading.value = false
    }
  }

  function reload(): void {
    void load()
  }

  function retryList(): void {
    retry(tagFor())
  }

  function cancelList(): void {
    cancel(tagFor(), source)
  }

  async function runAction(action: string, row: Row): Promise<void> {
    const key = actionKeyOf(row, action)
    // 并发提交同一个动作：在途直接忽略，只放行一次。
    if (pendingActions.has(key)) return
    pendingActions.add(key)
    const tag = tagFor(key)
    notices.clear(tag)
    try {
      const result = await postJson<ActionPayload>(
        `${endpoint}/${row.id}/actions`,
        { values: { action } },
        { tag, source },
      )
      // 200 但 ok:false 的业务异常已在请求层抛出，能到这里说明成功。
      notify('success', result.message || `「${action}」已生效`, source)
      reload()
    } catch (error) {
      if (error instanceof ApiError && !isAbortError(error)) {
        // 原因已由请求层统一登记；这里只挂页面级重试收尾。
        registerRetryHandler(tag, () => void runAction(action, row))
      }
    } finally {
      pendingActions.delete(key)
    }
  }

  function retryAction(row: Row, action: string): void {
    retry(tagFor(actionKeyOf(row, action)))
  }

  async function exportRows(): Promise<void> {
    if (exporting.value) return
    exporting.value = true
    const tag = tagFor('export')
    notices.clear(tag)
    const start = () =>
      download(`${endpoint}/export`, { tag, source })
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `${source}-导出.json`
          link.click()
          URL.revokeObjectURL(url)
          notify('success', `${source}清单已导出`, source)
        })
        .catch((error) => {
          if (!isAbortError(error)) {
            // 失败原因由请求层统一登记；重试仍走同一 tag。
            registerRetryHandler(tag, () => void exportRows())
          }
        })
        .finally(() => {
          exporting.value = false
        })
    await start()
  }

  function isActionPending(row: Row, action: string): boolean {
    return pendingActions.has(actionKeyOf(row, action))
  }

  onBeforeUnmount(() => {
    // 离开页面静默取消本页在途请求，不让旧页面状态继续落到已卸载组件上。
    seq += 1
    for (const key of Array.from(pendingActions)) {
      cancelByTag(tagFor(key), true)
      unregisterRetryHandler(tagFor(key))
    }
    cancelByTag(tagFor('export'), true)
    unregisterRetryHandler(tagFor('export'))
    cancelByTag(tagFor(), true)
    unregisterRetryHandler(tagFor())
  })

  return {
    rows,
    total,
    filters,
    loading,
    loadFailed,
    exporting,
    listNotice,
    actionNotice,
    reload,
    load,
    retryList,
    cancelList,
    runAction,
    retryAction,
    exportRows,
    isActionPending,
  }
}
