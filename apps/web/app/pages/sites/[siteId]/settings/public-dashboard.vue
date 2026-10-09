<script setup lang="ts">
import PublicDashboardSettingsContainer from '@/components/features/public-dashboard/PublicDashboardSettingsContainer.vue'
import { useSitePublicDashboard } from '@/components/features/public-dashboard/useSitePublicDashboard'
import SiteSettingsContainer from '@/components/features/site-settings/SiteSettingsContainer.vue'
import { parseSiteId } from '@/components/features/site-settings/site-settings.utils'
import { useSiteSettings } from '@/components/features/site-settings/useSiteSettings'

const route = useRoute()

const siteId = computed(() => parseSiteId(route.params.siteId))

const { snapshot, retry } = useSiteSettings({ siteId })

const controller = useSitePublicDashboard({ siteId })

const resolvedSiteId = computed(() => snapshot.value.siteId)
</script>

<template>
  <SiteSettingsContainer :retry="retry" :snapshot="snapshot">
    <PublicDashboardSettingsContainer
      v-if="resolvedSiteId"
      :controller="controller"
      :site-id="resolvedSiteId"
    />
  </SiteSettingsContainer>
</template>
