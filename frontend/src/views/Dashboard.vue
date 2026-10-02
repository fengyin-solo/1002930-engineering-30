<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
    </header>

    <RequestNotice :notice-key="noticeKey" :loading="loading" :on-retry="reload" :on-cancel="cancel" />

    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ loading && !cards.length ? '…' : card.value }}</strong>
      </article>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-if="loading && !moduleRows.length">
          <td colspan="4" class="empty-state">正在加载概览数据…</td>
        </tr>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
        <tr v-if="!loading && !moduleRows.length">
          <td colspan="4" class="empty-state">暂无概览数据</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import RequestNotice from '@/components/RequestNotice.vue'
import { fetchJson } from '@/api/client'
import { isApiError } from '@/api/errors'
import { NOTICE_KEYS, useNoticeStore } from '@/stores/notice'

type Overview = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

const noticeKey = NOTICE_KEYS.dashboard
const notices = useNoticeStore()

const cards = ref<Overview['cards']>([])
const moduleRows = ref<Overview['modules']>([])
const loading = ref(false)
let controller: AbortController | null = null

async function load(signal: AbortSignal) {
  // 失败不再吞掉填假数据：原因统一进 notice store，由横幅回显，可重试
  const payload = await fetchJson<Overview>('/api/overview', { signal })
  cards.value = payload.cards ?? []
  moduleRows.value = payload.modules ?? []
}

async function reload() {
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  notices.clear(noticeKey)
  try {
    await load(controller.signal)
  } catch (error) {
    if (isApiError(error) && error.kind === 'aborted') return
    notices.fail(noticeKey, error)
  } finally {
    loading.value = false
  }
}

function cancel() {
  controller?.abort()
  loading.value = false
}

reload()
</script>
