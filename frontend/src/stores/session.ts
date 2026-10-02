import { defineStore } from 'pinia'

import { cancelAllRequests } from '@/api/http'

/**
 * 身份的唯一存放处：请求头、页面状态都从这里读，不再各存一份。
 * 持久化只用 sessionStorage（整序列化为一条），关闭标签页即清除；
 * 退出时同步清空并取消全部在途请求，旧令牌立刻失效。
 */
const STORAGE_KEY = 'sesm.session'

interface SessionPayload {
  operator: string
  shiftLabel: string
  scope: string
  token: string
  issuedAt: number
}

interface SessionState extends SessionPayload {
  isAuthenticated: boolean
}

function readPersisted(): SessionPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionPayload
    if (!parsed.token || !parsed.operator) return null
    return parsed
  } catch {
    return null
  }
}

function persistedState(): SessionState {
  const saved = readPersisted()
  if (saved) {
    return { ...saved, isAuthenticated: true }
  }
  return {
    operator: '',
    shiftLabel: '',
    scope: '特种设备安全管理平台',
    token: '',
    issuedAt: 0,
    isAuthenticated: false,
  }
}

export const useSessionStore = defineStore('session', {
  state: (): SessionState => persistedState(),
  getters: {
    /** 请求层取身份的唯一入口。 */
    authHeader: (state) => (state.token ? `Bearer ${state.token}` : null),
  },
  actions: {
    /**
     * 建立会话。当前后端尚未提供鉴权接口（后端无 login 路由），
     * 先在本地按操作员签发令牌；后端接入后只需替换本方法，请求层无需改动。
     */
    login(operator: string, shiftLabel: string) {
      const payload: SessionPayload = {
        operator,
        shiftLabel,
        scope: '特种设备安全管理平台',
        token: `local.${Date.now()}.${Math.random().toString(36).slice(2)}`,
        issuedAt: Date.now(),
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      this.$patch({ ...payload, isAuthenticated: true })
    },
    /** 退出：清身份、持久化与全部在途请求，旧令牌在请求头里立刻消失。 */
    logout() {
      this.expire({ navigate: true })
    },
    /** 401 / 被服务端拒绝时复用同一套失效逻辑，并带上过期标记去登录页。 */
    handleExpired() {
      this.expire({ navigate: true, expired: true })
    },
    expire(options: { navigate?: boolean; expired?: boolean } = {}) {
      cancelAllRequests()
      sessionStorage.removeItem(STORAGE_KEY)
      this.$patch({
        operator: '',
        shiftLabel: '',
        token: '',
        issuedAt: 0,
        isAuthenticated: false,
      })
      if (options.navigate) {
        // 用整页跳转，确保各页面在途状态一并重建，且不再带旧身份。
        if (location.pathname !== '/login') {
          location.assign(`/login${options.expired ? '?expired=1' : ''}`)
        }
      }
    },
    setShift(label: string) {
      this.shiftLabel = label
      const saved = readPersisted()
      if (saved) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, shiftLabel: label }))
      }
    },
  },
})
