<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button v-if="loading" class="btn" type="button" @click="cancelLoad">取消</button>
        <button v-else-if="loadFailed" class="btn" type="button" @click="retryLoad">重试</button>
      </div>
    </header>
    <div v-if="loading && !cards.length" class="loading-state">指标加载中…</div>
    <template v-else>
      <div class="stat-row">
        <article v-for="card in cards" :key="card.label" class="stat-card">
          <span class="stat-label">{{ card.label }}</span>
          <strong class="stat-value">{{ card.value }}</strong>
        </article>
      </div>
      <table class="data-table">
        <thead>
          <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in moduleRows" :key="row.name">
            <td>{{ row.name }}</td>
            <td>{{ row.created }}</td>
            <td>{{ row.pending }}</td>
            <td>{{ row.abnormal }}</td>
          </tr>
          <tr v-if="!moduleRows.length">
            <td colspan="4" class="empty-state">概览数据未取到，请点击“重试”从断掉的那次继续取</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import {
  cancel,
  cancelByTag,
  fetchJson,
  isAbortError,
  registerRetryHandler,
  retry,
  unregisterRetryHandler,
} from '@/api/http'

type Overview = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

const TAG = '/api/overview#list'
const SOURCE = '运营概览'

const cards = ref<Overview['cards']>([])
const moduleRows = ref<Overview['modules']>([])
const loading = ref(false)
const loadFailed = ref(false)

async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    const payload = await fetchJson<Overview>('/api/overview', { tag: TAG, source: SOURCE })
    cards.value = payload.cards ?? []
    moduleRows.value = payload.modules ?? []
  } catch (error) {
    // 失败原因由请求层统一登记到全局提示条，这里不再吞掉后用假数据兜底。
    if (!isAbortError(error)) {
      loadFailed.value = true
      cards.value = []
      moduleRows.value = []
    }
  } finally {
    loading.value = false
  }
}

function retryLoad() {
  retry(TAG)
}

function cancelLoad() {
  cancel(TAG, SOURCE)
}

registerRetryHandler(TAG, () => void load())
onMounted(load)
onBeforeUnmount(() => {
  cancelByTag(TAG, true)
  unregisterRetryHandler(TAG)
})
</script>
