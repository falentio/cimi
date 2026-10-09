<script setup lang="ts">
useHeadSafe(useLocaleHead({ seo: false }))
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <UIToaster position="top-center" />
</template>
