<script setup lang="ts">
import CollectionPolicyContainer from '@/components/features/collection-policy/CollectionPolicyContainer.vue'
import { useSiteCollectionPolicy } from '@/components/features/collection-policy/useSiteCollectionPolicy'
import SiteSettingsContainer from '@/components/features/site-settings/SiteSettingsContainer.vue'
import { parseSiteId } from '@/components/features/site-settings/site-settings.utils'
import { useSiteSettings } from '@/components/features/site-settings/useSiteSettings'

const route = useRoute()

const siteId = computed(() => parseSiteId(route.params.siteId))

const { snapshot, retry } = useSiteSettings({ siteId })

const controller = useSiteCollectionPolicy({ siteId })

const resolvedSiteId = computed(() => snapshot.value.siteId)
</script>

<template>
  <SiteSettingsContainer :retry="retry" :snapshot="snapshot">
    <CollectionPolicyContainer
      v-if="resolvedSiteId"
      :controller="controller"
      :site-id="resolvedSiteId"
    />
  </SiteSettingsContainer>
</template>
