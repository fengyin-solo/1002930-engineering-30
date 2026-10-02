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
        <span v-if="session.isAuthenticated" class="head-user">
          当前值班：{{ session.operator }} · {{ session.shiftLabel }}
          <button type="button" class="link logout-link" @click="logout">退出登录</button>
        </span>
      </header>
      <NoticeBar />
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useSessionStore } from '@/stores/session'
import NoticeBar from '@/components/NoticeBar.vue'

const session = useSessionStore()

function logout() {
  // 身份从这一处清除：请求头立刻不再带令牌，全部在途请求一并取消。
  session.logout()
}

const navItems = [{ label: "运营概览", path: "/" }, { label: "使用登记", path: "/register" }, { label: "锅炉管理", path: "/boiler" }, { label: "压力容器", path: "/pressurevessel" }, { label: "压力管道", path: "/pipeline" }, { label: "电梯管理", path: "/elevator" }, { label: "起重机械", path: "/crane" }, { label: "场车管理", path: "/forklift" }, { label: "定期检验", path: "/inspection" }, { label: "维保记录", path: "/maintenance" }, { label: "隐患排查", path: "/hazard" }, { label: "事故管理", path: "/accident" }, { label: "作业人员", path: "/operator" }, { label: "培训考核", path: "/training" }, { label: "安全阀校验", path: "/safetyvalve" }, { label: "压力表检定", path: "/gauge" }, { label: "备件管理", path: "/sparepart" }, { label: "应急演练", path: "/emergency" }, { label: "能效监测", path: "/energyeff" }, { label: "档案管理", path: "/archive" }, { label: "维保合同", path: "/contract" }]
</script>

<style scoped>
.logout-link { margin-left: 8px; }
</style>
