<script setup lang="ts">
import SetupContainer from '@/components/features/setup/SetupContainer.vue'

definePageMeta({
  layout: 'default',
  admin: true,
})

useHead({ title: 'Cimi setup' })
</script>

<template>
  <SetupContainer />
</template>
