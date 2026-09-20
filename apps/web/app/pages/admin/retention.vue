<script setup lang="ts">
import RetentionAdminContainer from '@/components/features/retention-policy/RetentionAdminContainer.vue'

definePageMeta({
  admin: true,
})

useHead({ title: 'Retention settings' })
</script>

<template>
  <RetentionAdminContainer />
</template>
