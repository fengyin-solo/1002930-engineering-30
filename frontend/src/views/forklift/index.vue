<template>
  <section class="page" data-module="forklift">
    <header class="page-head">
      <div>
        <h2>场车管理管理</h2>
        <p class="page-desc">维护场内车辆，围绕车辆编号、车辆类型、动力类型、核定载重做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记场内车辆</button>
        <button class="btn" type="button" :disabled="exporting" @click="exportRows">导出场车管理清单</button>
      </div>
    </header>

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
      <button class="btn" type="submit" :disabled="loading">查询</button>
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
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td class="row-actions">
            <template v-for="action in actions" :key="action">
              <button
                class="link"
                type="button"
                :disabled="isActionPending(row, action)"
                @click="runAction(action, row)"
              >
                {{ action }}
              </button>
              <button
                v-if="actionNotice(row, action)"
                class="link retry-link"
                type="button"
                @click="retryAction(row, action)"
              >重试</button>
              <span v-if="actionNotice(row, action)" class="error-text row-error">{{ actionNotice(row, action)?.text }}</span>
            </template>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td v-if="loadFailed" :colspan="columns.length + 1" class="empty-state">数据未取到，可重试上一次请求</td>
          <td v-else :colspan="columns.length + 1" class="empty-state">暂无场车管理数据，可先登记场内车辆</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条场车管理记录</span>
      <span class="foot-controls">
        <i v-if="loading" class="muted-text">加载中…</i>
        <button v-if="loading" class="link" type="button" @click="cancelList">取消</button>
        <button v-else-if="listNotice && listNotice.retryable" class="link" type="button" @click="retryList">重试</button>
        <span v-if="listNotice" class="error-text">{{ listNotice.text }}</span>
      </span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

import { notify } from '@/api/http'
import { useModuleResource } from '@/composables/useModuleResource'

type Row = Record<string, string | number | null>

const ENDPOINT = '/api/forklift'
const columns = ["车辆编号", "车辆类型", "动力类型", "核定载重", "行驶区域", "驾驶员", "年检日期", "车辆状态"]
const actions = ["安排维修", "安排年检", "申请报废"]
const statuses = ["正常", "维修中", "待年检", "已报废"]
const stats = [{"label": "正常车辆", "value": 0}, {"label": "维修车辆", "value": 0}, {"label": "待年检车辆", "value": 0}]
const filterFields = columns.slice(0, 3)

const {
  rows,
  total,
  filters,
  loading,
  loadFailed,
  exporting,
  listNotice,
  reload,
  retryList,
  cancelList,
  runAction,
  retryAction,
  actionNotice,
  exportRows,
  isActionPending,
} = useModuleResource(ENDPOINT, '场车管理')

function resetFilters() {
  for (const key of Object.keys(filters)) delete filters[key]
  reload()
}

function openCreate() {
  notify('info', '场内车辆登记入口尚未接入审批流', '场车管理')
}

onMounted(reload)
</script>
