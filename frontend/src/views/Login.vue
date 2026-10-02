<template>
  <section class="login-page">
    <form class="login-card" @submit.prevent="submit">
      <h2>登录特种设备安全管理平台</h2>
      <p class="page-desc">身份从统一会话取，登录后请求头自动附带，退出后立即失效。</p>

      <label class="filter-item">
        <span>值班人员</span>
        <input v-model="operator" placeholder="请输入姓名" autocomplete="username" />
      </label>
      <label class="filter-item">
        <span>访问令牌（可选，本地开发留空即可）</span>
        <input v-model="token" placeholder="留空则使用本地开发令牌" autocomplete="current-password" />
      </label>

      <RequestNotice :notice-key="noticeKey" :on-retry="submit" />

      <button class="btn primary" type="submit" :disabled="submitting">
        {{ submitting ? '登录中…' : '登录' }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import RequestNotice from '@/components/RequestNotice.vue'
import { useNoticeStore } from '@/stores/notice'
import { useSessionStore } from '@/stores/session'

const noticeKey = 'session:login'
const notices = useNoticeStore()
const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const operator = ref('值班管理员')
const token = ref('')
const submitting = ref(false)

function submit() {
  submitting.value = true
  notices.clear(noticeKey)
  try {
    if (token.value.trim()) {
      session.login({
        token: token.value.trim(),
        operator: operator.value.trim() || '值班管理员',
        shiftLabel: '白班 08:00-20:00',
        scope: '特种设备安全管理平台',
      })
    } else {
      // 本地开发：令牌只在 identity 一处生成
      session.loginLocal(operator.value)
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    void router.replace(redirect)
  } catch (error) {
    notices.fail(noticeKey, error)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  padding-top: 8vh;
}
.login-card {
  width: 380px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.login-card h2 { margin: 0; font-size: 18px; }
.login-card button { align-self: flex-start; }
</style>
