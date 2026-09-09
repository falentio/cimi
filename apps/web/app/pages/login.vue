<script setup lang="ts">
import AuthPanel from '@/components/AuthPanel.vue'

definePageMeta({
  layout: 'bare',
  auth: false,
})
</script>

<template>
  <AuthPanel mode="login" />
</template>
