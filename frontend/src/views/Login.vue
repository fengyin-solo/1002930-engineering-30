<template>
  <section class="login-page">
    <form class="login-card" @submit.prevent="submit">
      <h2 class="login-title">特种设备安全管理平台</h2>
      <p v-if="expired" class="error-text login-tip">登录状态已失效，请重新登录</p>
      <p v-else class="login-tip">请刷工牌或输入值班信息后进入</p>
      <label class="filter-item">
        <span>值班人员</span>
        <input v-model="operator" placeholder="如：值班管理员" autocomplete="username" />
      </label>
      <label class="filter-item">
        <span>班次</span>
        <input v-model="shiftLabel" placeholder="如：白班 08:00-20:00" />
      </label>
      <button class="btn primary" type="submit" :disabled="submitting">
        {{ submitting ? '登录中…' : '进入平台' }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const operator = ref(session.operator || '值班管理员')
const shiftLabel = ref(session.shiftLabel || '白班 08:00-20:00')
const submitting = ref(false)
// 401 顶下线时通过整页跳转并带 ?expired=1，刷新后从 URL 恢复提示。
const expired = computed(() => route.query.expired === '1')

async function submit() {
  if (!operator.value.trim()) return
  submitting.value = true
  // 当前为本地签发（后端暂无鉴权接口）；替换为真实登录接口后，
  // 成功后仍只需调用 session.login，请求层自动从同一处取身份。
  session.login(operator.value.trim(), shiftLabel.value.trim() || '未排班')
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  await router.replace(redirect)
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f6f8fb;
}
.login-card {
  width: 360px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.login-title { margin: 0; font-size: 18px; }
.login-tip { margin: 0; font-size: 13px; color: var(--muted); }
.login-card input { width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; }
</style>
