/**
 * 会话状态：页面显示用的视图，身份本身只有 identity 一份。
 * 这里不缓存令牌，operator/shiftLabel 全部实时从 identity 取；
 * 退出后 identity 立即清空，本 store 随之变成未登录态，请求头也同步失效。
 */
import { defineStore } from 'pinia'

import {
  createLocalIdentity,
  getIdentity,
  isAuthenticated,
  logout as identityLogout,
  onInvalidate,
  onChange,
  setIdentity,
  type Identity,
} from '@/api/identity'

export const useSessionStore = defineStore('session', {
  state: () => {
    const identity = getIdentity()
    return {
      // 仅用于驱动视图重渲染；真正取值始终经 getIdentity()
      version: 0,
      authenticated: isAuthenticated(),
      operator: identity?.operator ?? '',
      shiftLabel: identity?.shiftLabel ?? '',
      scope: identity?.scope ?? '特种设备安全管理平台',
    }
  },
  getters: {
    canOperate: (state) => state.authenticated && state.operator.length > 0,
  },
  actions: {
    /** 订阅身份变更，登录/退出/401 失效时页面状态与请求层保持同源同步。 */
    bind() {
      onChange(() => this.syncFromIdentity())
      onInvalidate(() => this.syncFromIdentity())
    },
    syncFromIdentity() {
      const identity = getIdentity()
      this.authenticated = !!identity?.token
      this.operator = identity?.operator ?? ''
      this.shiftLabel = identity?.shiftLabel ?? ''
      this.scope = identity?.scope ?? this.scope
      this.version += 1
    },
    login(identity: Identity) {
      setIdentity(identity)
    },
    /** 本地开发登录：无后端鉴权接口时生成一次性本地令牌。 */
    loginLocal(operator: string, shiftLabel?: string) {
      setIdentity(createLocalIdentity(operator, shiftLabel))
    },
    logout() {
      identityLogout()
    },
  },
})
