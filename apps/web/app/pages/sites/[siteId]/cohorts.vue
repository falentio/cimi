<script setup lang="ts">
import CohortsContainer from '@/components/features/cohort-retention/CohortsContainer.vue'
import { parseSiteId } from '@/components/features/site-settings/site-settings.utils'
import type { SiteId } from '@/components/features/site-settings/site-settings.types'

const route = useRoute()

const siteId = computed<SiteId | undefined>(() => parseSiteId(route.params.siteId))
</script>

<template>
  <CohortsContainer :site-id="siteId" />
</template>
