/**
 * 一次性 codemod：把 20 个同构模块页迁移到统一请求层。
 * 运行：node scripts/codemod-module-views.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const LABELS = {
  register: '使用登记',
  boiler: '锅炉管理',
  pressurevessel: '压力容器',
  pipeline: '压力管道',
  elevator: '电梯管理',
  crane: '起重机械',
  forklift: '场车管理',
  inspection: '定期检验',
  maintenance: '维保记录',
  hazard: '隐患排查',
  accident: '事故管理',
  operator: '作业人员',
  training: '培训考核',
  safetyvalve: '安全阀校验',
  gauge: '压力表检定',
  sparepart: '备件管理',
  emergency: '应急演练',
  energyeff: '能效监测',
  archive: '档案管理',
  contract: '维保合同',
}

const files = execSync('ls src/views/*/index.vue', { encoding: 'utf8' }).trim().split('\n')

for (const file of files) {
  let vue = readFileSync(file, 'utf8')
  const moduleName = file.match(/src\/views\/([^/]+)\//)[1]
  const label = LABELS[moduleName]
  if (!label) throw new Error(`缺少模块标签：${moduleName}`)

  // ---- 模板：查询 / 导出 / 行动作按钮的在途禁用 ----
  vue = vue.replace(
    '<button class="btn" type="submit">查询</button>',
    '<button class="btn" type="submit" :disabled="loading">查询</button>',
  )
  vue = vue.replace(
    /(<button class="btn" type="button" @click="exportRows">)/,
    '<button class="btn" type="button" :disabled="exporting" @click="exportRows">',
  )
  vue = vue.replace(
    /(<button\s+v-for="action in actions"\s+:key="action"\s+class="link"\s+type="button")/s,
    '$1\n              :disabled="isActionPending(row, action)"',
  )

  // ---- 模板：页脚换成统一原因 + 重试 / 取消 ----
  vue = vue.replace(
    /<span v-if="errorMessage" class="error-text">\{\{ errorMessage \}\}<\/span>/,
    `<span class="foot-controls">
        <i v-if="loading" class="muted-text">加载中…</i>
        <button v-if="loading" class="link" type="button" @click="cancelList">取消</button>
        <button v-else-if="listNotice && listNotice.retryable" class="link" type="button" @click="retryList">重试</button>
        <span v-if="listNotice" class="error-text">{{ listNotice.text }}</span>
      </span>`,
  )

  // ---- 脚本整体替换（保留各模块 columns/actions/statuses/stats 文案）----
  const endpoint = vue.match(/const ENDPOINT = '([^']+)'/)[1]
  const columns = vue.match(/const columns = (\[[^\n]+\])/)[1]
  const actions = vue.match(/const actions = (\[[^\n]+\])/)[1]
  const statuses = vue.match(/const statuses = (\[[^\n]+\])/)[1]
  const stats = vue.match(/const stats = (\[[^\n]+\])/)[1]
  const openCreateMessage = vue.match(/errorMessage\.value = '([^']+)'/)[1]

  const script = `<script setup lang="ts">
import { onMounted } from 'vue'

import { notify } from '@/api/http'
import { useModuleResource } from '@/composables/useModuleResource'

type Row = Record<string, string | number | null>

const ENDPOINT = '${endpoint}'
const columns = ${columns}
const actions = ${actions}
const statuses = ${statuses}
const stats = ${stats}
const filterFields = columns.slice(0, 3)

const {
  rows,
  total,
  filters,
  loading,
  exporting,
  listNotice,
  reload,
  retryList,
  cancelList,
  runAction,
  exportRows,
  isActionPending,
} = useModuleResource(ENDPOINT, '${label}')

function resetFilters() {
  for (const key of Object.keys(filters)) delete filters[key]
  reload()
}

function openCreate() {
  notify('info', '${openCreateMessage}', '${label}')
}

onMounted(reload)
</script>`

  vue = vue.replace(/<script setup lang="ts">[\s\S]*?<\/script>/, script)
  writeFileSync(file, vue)
  console.log(`migrated ${file} (${label})`)
}
