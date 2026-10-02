<template>
  <div class="app-shell">
    <aside class="app-side">
      <h1 class="app-title">特种设备安全管理平台</h1>
      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="app-main">
      <header class="app-head">
        <span class="head-desc">面向锅炉、压力容器、电梯、起重机械与场内专用机动车辆等特种设备的注册登记、定期检验、维保监管与隐患排查的一体化安全管理后台。</span>
        <span class="head-user">
          当前值班：{{ session.operator || '未登录' }} · {{ session.shiftLabel || '—' }}
          <button v-if="session.authenticated" class="link" type="button" @click="logout">退出登录</button>
        </span>
      </header>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

import { logout as clearIdentity } from '@/api/identity'
import { useNoticeStore } from '@/stores/notice'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const notices = useNoticeStore()

// 绑定身份订阅：登录/退出/401 失效后页面状态实时同步
session.bind()
// 全局最近一次原因也挂在这里：任何页面失败，页头之外的地方也能读到同一份
void notices.latest

function logout() {
  // 一处清除：令牌、持久化、在途请求全部立即失效
  clearIdentity()
  void router.replace({ name: 'login' })
}

const navItems = [{ label: "运营概览", path: "/" }, { label: "使用登记", path: "/register" }, { label: "锅炉管理", path: "/boiler" }, { label: "压力容器", path: "/pressurevessel" }, { label: "压力管道", path: "/pipeline" }, { label: "电梯管理", path: "/elevator" }, { label: "起重机械", path: "/crane" }, { label: "场车管理", path: "/forklift" }, { label: "定期检验", path: "/inspection" }, { label: "维保记录", path: "/maintenance" }, { label: "隐患排查", path: "/hazard" }, { label: "事故管理", path: "/accident" }, { label: "作业人员", path: "/operator" }, { label: "培训考核", path: "/training" }, { label: "安全阀校验", path: "/safetyvalve" }, { label: "压力表检定", path: "/gauge" }, { label: "备件管理", path: "/sparepart" }, { label: "应急演练", path: "/emergency" }, { label: "能效监测", path: "/energyeff" }, { label: "档案管理", path: "/archive" }, { label: "维保合同", path: "/contract" }]
</script>
