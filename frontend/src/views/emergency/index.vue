<template>
  <section class="page" data-module="emergency">
    <header class="page-head">
      <div>
        <h2>应急演练管理</h2>
        <p class="page-desc">维护演练记录，围绕演练编号、演练主题、演练类型、参与单位做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记演练记录</button>
        <button class="btn" type="button" @click="exportRows">导出应急演练清单</button>
      </div>
    </header>
    <RequestNotice :notice-key="listKey" :loading="loading" :on-retry="reload" :on-cancel="cancel" />

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading && !rows.length"><td :colspan="columns.length + 1" class="empty-state">正在加载应急演练数据…</td></tr>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!loading && !rows.length">
          <td :colspan="columns.length + 1" class="empty-state">暂无应急演练数据，可先登记演练记录</td>
        </tr>
        <tr v-if="hasMore"><td :colspan="columns.length + 1" class="empty-state"><button class="link" type="button" @click="loadMore">从断掉的那次接着取 / 加载更多</button></td></tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条应急演练记录</span>
      <span v-if="info">{{ info }}</span>
      <RequestNotice :notice-key="'/api/emergency:action'" />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

import RequestNotice from '@/components/RequestNotice.vue'
import { useModulePage } from '@/composables/useModulePage'

const ENDPOINT = '/api/emergency'
const columns = ["演练编号", "演练主题", "演练类型", "参与单位", "演练日期", "演练评估", "改进措施", "演练状态"]
const actions = ["组织演练", "完成演练", "复盘总结"]
const statuses = ["待组织", "已组织", "已完成", "已复盘"]
const stats = [{"label": "待组织演练", "value": 0}, {"label": "已完成演练", "value": 0}, {"label": "已复盘演练", "value": 0}]
const filterFields = columns.slice(0, 3)

const {
  filters,
  info,
  rows,
  total,
  loading,
  hasMore,
  listKey,
  reload,
  resetFilters,
  loadMore,
  cancel,
  runAction,
  exportRows,
  openCreate,
} = useModulePage({ endpoint: ENDPOINT, label: '应急演练' })

onMounted(reload)
</script>
