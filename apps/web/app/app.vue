<script setup lang="ts">
const route = useRoute()
const isAppRoute = computed(() => route.path === '/app' || route.path.startsWith('/app/'))
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout v-if="isAppRoute" name="app">
    <NuxtPage />
  </NuxtLayout>
  <NuxtPage v-else />
</template>
