<script setup lang="ts">
import OrganizationHomeContainer from '@/components/features/organization-home/OrganizationHomeContainer.vue'
import { useOrganizationHome } from '@/components/features/organization-home/useOrganizationHome'

const { state, refresh } = useOrganizationHome()
</script>

<template>
  <OrganizationHomeContainer :state="state" :refresh="refresh" />
</template>
