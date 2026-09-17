<script setup lang="ts">
import AuthPanel from '@/components/AuthPanel.vue'

const route = useRoute()
const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : undefined

definePageMeta({
  layout: 'bare',
  auth: false,
})
</script>

<template>
  <AuthPanel mode="login" :redirect="redirect" />
</template>
