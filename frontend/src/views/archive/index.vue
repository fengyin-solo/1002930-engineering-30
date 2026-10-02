<template>
  <section class="page" data-module="archive">
    <header class="page-head">
      <div>
        <h2>档案管理管理</h2>
        <p class="page-desc">维护设备档案，围绕档案编号、所属设备、档案类别、归档日期做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记设备档案</button>
        <button class="btn" type="button" :disabled="exporting" @click="exportRows">导出档案管理清单</button>
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
          <td v-else :colspan="columns.length + 1" class="empty-state">暂无档案管理数据，可先登记设备档案</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条档案管理记录</span>
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

const ENDPOINT = '/api/archive'
const columns = ["档案编号", "所属设备", "档案类别", "归档日期", "借阅人", "借阅日期", "归还日期", "档案状态"]
const actions = ["办理借阅", "登记归还", "申请销毁"]
const statuses = ["在库", "借出中", "已归还", "已销毁"]
const stats = [{"label": "在库档案", "value": 0}, {"label": "借出档案", "value": 0}, {"label": "已归还档案", "value": 0}]
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
} = useModuleResource(ENDPOINT, '档案管理')

function resetFilters() {
  for (const key of Object.keys(filters)) delete filters[key]
  reload()
}

function openCreate() {
  notify('info', '设备档案登记入口尚未接入审批流', '档案管理')
}

onMounted(reload)
</script>
