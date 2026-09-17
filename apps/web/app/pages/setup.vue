<script setup lang="ts">
import SetupContainer from '@/components/features/setup/SetupContainer.vue'

definePageMeta({
  layout: 'bare',
  auth: false,
})

useHead({ title: 'Cimi setup' })
</script>

<template>
  <SetupContainer />
</template>
