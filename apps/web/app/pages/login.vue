<script setup lang="ts">
import AuthPanel from '@/components/AuthPanel.vue'

definePageMeta({
  layout: 'bare',
  auth: false,
  key: (route) => route.path.replace(/^\/fr(?=\/)/, ''),
})
</script>

<template>
  <AuthPanel mode="login" />
</template>
