<template>
  <!-- 原因统一从 notice store 按 key 取：其他页面/组件用同一个 key 读到的是同一份 -->
  <div v-if="notice.message" class="request-notice error-text" role="alert">
    <span class="notice-reason">{{ notice.message }}</span>
    <span class="notice-actions">
      <button v-if="onRetry" class="link" type="button" @click="onRetry">重试</button>
      <button v-if="onCancel && loading" class="link" type="button" @click="onCancel">取消</button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { useNoticeStore } from '@/stores/notice'

const props = defineProps<{
  noticeKey: string
  loading?: boolean
  onRetry?: () => void
  onCancel?: () => void
}>()

const notices = useNoticeStore()
const notice = computed(() => notices.notice(props.noticeKey))
</script>
