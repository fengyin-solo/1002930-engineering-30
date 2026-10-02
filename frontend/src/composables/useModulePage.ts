/**
 * 19 个业务模块页面的共用实现：页面只保留各自的字段、动作、状态常量，
 * 请求、分档错误、续取、并发去重、原因回显全部走这一份。
 */
import { ref } from 'vue'

import { request } from '@/api/client'
import { isApiError } from '@/api/errors'
import { useActionSubmit } from '@/composables/useAsyncResource'
import { useModuleList } from '@/composables/useModuleList'

export interface ModulePageOptions {
  endpoint: string
  /** 模块中文名，用于拼统一提示，如「锅炉管理」。 */
  label: string
  pageSize?: number
}

export type Row = Record<string, string | number | null>

export function useModulePage(options: ModulePageOptions) {
  const { endpoint, label } = options
  const listKey = `${endpoint}:list`
  const actionKeyBase = `${endpoint}:action`

  const filters = ref<Record<string, string>>({})
  const info = ref('')

  const list = useModuleList<Row>(endpoint, { noticeKey: listKey, pageSize: options.pageSize })

  // 动作提交：同一个 模块+记录+动作 的并发点击只放行一次
  const action = useActionSubmit<{ ok: boolean; message?: string }>(`${endpoint}:action`)

  async function runAction(actionName: string, row: Row) {
    const result = await action.submit(
      `${endpoint}/${row.id}/actions`,
      { action: actionName },
      { actionKey: `${actionKeyBase}:${row.id}:${actionName}` },
    )
    if (result.ok) {
      info.value = result.data?.message || `${label}动作已生效`
      await list.reload(filters.value)
    }
    // 失败原因已在 submit 内写进统一 store，由页面上的 RequestNotice 回显
  }

  async function reload() {
    info.value = ''
    await list.reload(filters.value)
  }

  function resetFilters() {
    filters.value = {}
    void reload()
  }

  /** 导出也走统一请求层（带身份头与统一错误处理），不再 window.open 绕过。 */
  async function exportRows() {
    try {
      const query = new URLSearchParams(filters.value).toString()
      const response = await request(`${endpoint}/export${query ? `?${query}` : ''}`, {
        dedupeKey: `${endpoint}:export`,
      })
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${label}-清单.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      if (isApiError(err) && err.kind === 'aborted') return
      throw err
    }
  }

  function openCreate() {
    // 入口未接入时也统一回显，而不是写死一句页面私有文案
    info.value = `${label}登记入口尚未接入审批流`
  }

  return {
    filters,
    info,
    rows: list.rows,
    total: list.total,
    loading: list.loading,
    loadingMore: list.loadingMore,
    hasMore: list.hasMore,
    reason: list.reason,
    listKey,
    reload,
    resetFilters,
    loadMore: list.loadMore,
    resume: list.resume,
    cancel: list.cancel,
    runAction,
    actionSubmitting: action.submitting,
    exportRows,
    openCreate,
  }
}
