/**
 * 身份的唯一存放处：请求头要带的令牌、页面要显示的值班信息都从这里取，
 * 不再在请求头与页面状态里各存一份。持久化也只写这一个键。
 *
 * 退出（logout）会立刻清掉令牌并广播失效事件，请求层订阅后会：
 * 1. 后续请求不再带旧身份；2. 在途请求全部取消。
 */
export interface Identity {
  /** 访问令牌；为空表示未登录，请求层不会附带 Authorization 头。 */
  token: string
  operator: string
  shiftLabel?: string
  scope?: string
}

const STORAGE_KEY = 'sq_session'
const MOCK_TOKEN_PREFIX = 'local-'

type Listener = (identity: Identity | null) => void
type InvalidateListener = () => void

let current: Identity | null = null
const listeners = new Set<Listener>()
const invalidateListeners = new Set<InvalidateListener>()

function readPersisted(): Identity | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Identity>
    if (typeof parsed.token !== 'string' || !parsed.token) return null
    return {
      token: parsed.token,
      operator: typeof parsed.operator === 'string' ? parsed.operator : '',
      shiftLabel: typeof parsed.shiftLabel === 'string' ? parsed.shiftLabel : undefined,
      scope: typeof parsed.scope === 'string' ? parsed.scope : undefined,
    }
  } catch {
    return null
  }
}

function persist(identity: Identity | null) {
  try {
    if (identity) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 隐私模式等写不进存储时，内存里的身份仍然生效
  }
}

// 模块加载即恢复，一次读取，全局共用同一份
current = readPersisted()

export function getIdentity(): Identity | null {
  return current
}

export function isAuthenticated(): boolean {
  return !!current?.token
}

export function setIdentity(next: Identity): void {
  current = { ...next }
  persist(current)
  emit()
}

/** 本地开发用：不输真实令牌也能进，令牌只在这一处生成。 */
export function createLocalIdentity(operator: string, shiftLabel?: string): Identity {
  return {
    token: `${MOCK_TOKEN_PREFIX}${Date.now()}.${Math.random().toString(36).slice(2, 10)}`,
    operator: operator.trim() || '值班管理员',
    shiftLabel: shiftLabel || '白班 08:00-20:00',
    scope: '特种设备安全管理平台',
  }
}

/** 退出登录：立刻失效。清持久化、广播变更与失效，不保留任何旧身份。 */
export function logout(): void {
  if (!current) return
  current = null
  persist(null)
  emit()
  for (const listener of invalidateListeners) {
    try {
      listener()
    } catch {
      // 订阅方出错不影响退出
    }
  }
}

/** 身份被服务端判失效（401）时调用：与退出走同一条失效路径。 */
export function invalidate(): void {
  if (current) logout()
}

export function onChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 订阅「退出/失效」：请求层用来取消所有在途请求。 */
export function onInvalidate(listener: InvalidateListener): () => void {
  invalidateListeners.add(listener)
  return () => invalidateListeners.delete(listener)
}

function emit() {
  for (const listener of listeners) {
    try {
      listener(current)
    } catch {
      // 页面订阅方出错不影响身份广播
    }
  }
}
