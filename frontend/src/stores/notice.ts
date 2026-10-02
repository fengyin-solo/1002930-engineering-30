/**
 * 统一的原因回显存放处：页面不再各自吞错或编一句兜底文案。
 *
 * - notice(key)：按 key 读同一份原因（别的页面/组件用同一个 key 读到的就是这里出错时写入的那句）；
 * - latest：全局最近一次失败原因，供页头/全局横幅与跨页面场景读取；
 * - 动作提交与列表加载各写各的 key，互不覆盖。
 */
import { defineStore } from 'pinia'

import { describeError, ApiError } from '@/api/errors'

export interface NoticeState {
  /** 统一可读原因，空串表示当前无错误。 */
  message: string
  kind: ApiError['kind'] | null
  /** 重试时可以保留原因直到有新结果；updatedAt 供响应式刷新。 */
  updatedAt: number
}

const emptyNotice = (): NoticeState => ({ message: '', kind: null, updatedAt: 0 })

export const NOTICE_KEYS = {
  latest: '__global_latest__',
  dashboard: 'dashboard',
} as const

export const useNoticeStore = defineStore('notice', {
  state: () => ({
    notices: { [NOTICE_KEYS.latest]: emptyNotice() } as Record<string, NoticeState>,
  }),
  getters: {
    /** 全局最近一次失败原因（任意页面失败都会刷新它）。 */
    latest(state): NoticeState {
      return state.notices[NOTICE_KEYS.latest] ?? emptyNotice()
    },
  },
  actions: {
    notice(key: string): NoticeState {
      return this.notices[key] ?? emptyNotice()
    },
    /** 记录一次失败：同时写 key 维度与全局 latest，保证别处读到同一份。 */
    fail(key: string, error: unknown): string {
      const message = describeError(error)
      const kind = error instanceof ApiError ? error.kind : 'http'
      const next: NoticeState = { message, kind, updatedAt: Date.now() }
      this.notices[key] = { ...next }
      this.notices[NOTICE_KEYS.latest] = { ...next }
      return message
    },
    /** 直接写一句原因（如业务侧的提示），走同一份存储。 */
    set(key: string, message: string, kind: NoticeState['kind'] = null) {
      const next: NoticeState = { message, kind, updatedAt: Date.now() }
      this.notices[key] = { ...next }
      this.notices[NOTICE_KEYS.latest] = { ...next }
    },
    clear(key?: string) {
      if (key) {
        if (key !== NOTICE_KEYS.latest) this.notices[key] = emptyNotice()
      } else {
        this.notices = { [NOTICE_KEYS.latest]: emptyNotice() }
      }
    },
  },
})
