<template>
  <section class="page" data-module="boiler">
    <header class="page-head">
      <div>
        <h2>锅炉管理管理</h2>
        <p class="page-desc">维护锅炉，围绕锅炉编号、锅炉型号、额定蒸发量、工作压力做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记锅炉</button>
        <button class="btn" type="button" @click="exportRows">导出锅炉管理清单</button>
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
        <tr v-if="loading && !rows.length"><td :colspan="columns.length + 1" class="empty-state">正在加载锅炉管理数据…</td></tr>
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
          <td :colspan="columns.length + 1" class="empty-state">暂无锅炉管理数据，可先登记锅炉</td>
        </tr>
        <tr v-if="hasMore"><td :colspan="columns.length + 1" class="empty-state"><button class="link" type="button" @click="loadMore">从断掉的那次接着取 / 加载更多</button></td></tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条锅炉管理记录</span>
      <span v-if="info">{{ info }}</span>
      <RequestNotice :notice-key="'/api/boiler:action'" />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

import RequestNotice from '@/components/RequestNotice.vue'
import { useModulePage } from '@/composables/useModulePage'

const ENDPOINT = '/api/boiler'
const columns = ["锅炉编号", "锅炉型号", "额定蒸发量", "工作压力", "燃料类型", "使用年限", "司炉人员", "锅炉状态"]
const actions = ["降负荷运行", "停炉检修", "恢复运行"]
const statuses = ["正常运行", "低负荷", "检修中", "已停炉"]
const stats = [{"label": "运行锅炉", "value": 0}, {"label": "检修锅炉", "value": 0}, {"label": "停炉锅炉", "value": 0}]
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
} = useModulePage({ endpoint: ENDPOINT, label: '锅炉管理' })

onMounted(reload)
</script>
