import { defineStore } from 'pinia'

/**
 * 全局提示 / 失败原因：任何页面、请求层都只往这里登记。
 * 页面脚注与顶栏读的是同一份 latest，跨页面看到的原因一致。
 */
export type NoticeKind = 'error' | 'success' | 'info'

export interface Notice {
  id: number
  kind: NoticeKind
  text: string
  /** 关联请求标签：有它才能重试 / 取消；普通提示为空。 */
  tag?: string
  /** 来源模块，用于在提示里标明发生在哪个页面。 */
  source?: string
  /** 该失败是否可重试（业务校验类失败不提供重试）。 */
  retryable?: boolean
  at: number
}

interface NoticeState {
  latest: Notice | null
  seq: number
}

export const useNoticeStore = defineStore('notice', {
  state: (): NoticeState => ({
    latest: null,
    seq: 0,
  }),
  getters: {
    /** 当前是否存在与某个请求标签关联的失败原因。 */
    latestFor: (state) => (tag: string) =>
      state.latest && state.latest.tag === tag ? state.latest : null,
  },
  actions: {
    push(notice: Omit<Notice, 'id' | 'at'>) {
      this.seq += 1
      this.latest = { ...notice, id: this.seq, at: Date.now() }
    },
    clear(tag?: string) {
      if (tag === undefined || this.latest?.tag === tag) {
        this.latest = null
      }
    },
  },
})
