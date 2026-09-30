<script setup lang="ts">
import AdminOperationsContainer from '@/components/features/admin-operations/AdminOperationsContainer.vue'

definePageMeta({
  admin: true,
})

useHead({ title: 'Admin operations' })
</script>

<template>
  <AdminOperationsContainer />
</template>
