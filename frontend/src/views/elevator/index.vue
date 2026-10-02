<template>
  <section class="page" data-module="elevator">
    <header class="page-head">
      <div>
        <h2>电梯管理管理</h2>
        <p class="page-desc">维护电梯，围绕电梯编号、电梯类型、额定载重、层站数做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记电梯</button>
        <button class="btn" type="button" :disabled="exporting" @click="exportRows">导出电梯管理清单</button>
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
          <td v-else :colspan="columns.length + 1" class="empty-state">暂无电梯管理数据，可先登记电梯</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条电梯管理记录</span>
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

const ENDPOINT = '/api/elevator'
const columns = ["电梯编号", "电梯类型", "额定载重", "层站数", "维保单位", "上次维保", "下次维保日", "电梯状态"]
const actions = ["安排维保", "困人救援", "故障检修"]
const statuses = ["正常运行", "维保中", "困人", "检修中"]
const stats = [{"label": "正常运行电梯", "value": 0}, {"label": "维保电梯", "value": 0}, {"label": "检修电梯", "value": 0}]
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
} = useModuleResource(ENDPOINT, '电梯管理')

function resetFilters() {
  for (const key of Object.keys(filters)) delete filters[key]
  reload()
}

function openCreate() {
  notify('info', '电梯登记入口尚未接入审批流', '电梯管理')
}

onMounted(reload)
</script>
