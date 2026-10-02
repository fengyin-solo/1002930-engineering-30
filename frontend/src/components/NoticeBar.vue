<template>
  <div v-if="notice" class="notice-bar" :class="'notice-' + notice.kind" role="alert">
    <span class="notice-text">
      <template v-if="notice.source">[{{ notice.source }}] </template>{{ notice.text }}
    </span>
    <span class="notice-actions">
      <button
        v-if="notice.kind === 'error' && notice.retryable && notice.tag"
        type="button"
        class="link"
        @click="onRetry"
      >
        重试
      </button>
      <button
        v-if="notice.tag && inflight"
        type="button"
        class="link"
        @click="onCancel"
      >
        取消
      </button>
      <button type="button" class="link" @click="notices.clear()">知道了</button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { cancel, hasInflight, onInflightChange, retry } from '@/api/http'
import { useNoticeStore } from '@/stores/notice'

const notices = useNoticeStore()
const notice = computed(() => notices.latest)
const inflight = ref(false)

function syncInflight() {
  inflight.value = notice.value?.tag ? hasInflight(notice.value.tag) : false
}

watch(notice, syncInflight, { immediate: true })
const off = onInflightChange((tag) => {
  if (notice.value?.tag === tag) syncInflight()
})
onBeforeUnmount(off)

function onRetry() {
  const tag = notice.value?.tag
  if (tag) retry(tag)
}

function onCancel() {
  const current = notice.value
  if (current?.tag) cancel(current.tag, current.source)
}
</script>

<style scoped>
.notice-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 12px;
  border: 1px solid transparent;
}
.notice-error { background: #fef3f2; border-color: #fecdca; color: #b42318; }
.notice-success { background: #ecfdf3; border-color: #abefc6; color: #067647; }
.notice-info { background: #eff8ff; border-color: #b2ddff; color: #175cd3; }
.notice-actions { display: flex; gap: 10px; flex-shrink: 0; }
</style>
