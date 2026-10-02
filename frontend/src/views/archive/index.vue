<template>
  <section class="page" data-module="archive">
    <header class="page-head">
      <div>
        <h2>档案管理管理</h2>
        <p class="page-desc">维护设备档案，围绕档案编号、所属设备、档案类别、归档日期做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记设备档案</button>
        <button class="btn" type="button" @click="exportRows">导出档案管理清单</button>
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
        <tr v-if="loading && !rows.length"><td :colspan="columns.length + 1" class="empty-state">正在加载档案管理数据…</td></tr>
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
          <td :colspan="columns.length + 1" class="empty-state">暂无档案管理数据，可先登记设备档案</td>
        </tr>
        <tr v-if="hasMore"><td :colspan="columns.length + 1" class="empty-state"><button class="link" type="button" @click="loadMore">从断掉的那次接着取 / 加载更多</button></td></tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条档案管理记录</span>
      <span v-if="info">{{ info }}</span>
      <RequestNotice :notice-key="'/api/archive:action'" />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

import RequestNotice from '@/components/RequestNotice.vue'
import { useModulePage } from '@/composables/useModulePage'

const ENDPOINT = '/api/archive'
const columns = ["档案编号", "所属设备", "档案类别", "归档日期", "借阅人", "借阅日期", "归还日期", "档案状态"]
const actions = ["办理借阅", "登记归还", "申请销毁"]
const statuses = ["在库", "借出中", "已归还", "已销毁"]
const stats = [{"label": "在库档案", "value": 0}, {"label": "借出档案", "value": 0}, {"label": "已归还档案", "value": 0}]
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
} = useModulePage({ endpoint: ENDPOINT, label: '档案管理' })

onMounted(reload)
</script>
