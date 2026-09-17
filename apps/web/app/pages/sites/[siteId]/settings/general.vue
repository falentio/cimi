<script setup lang="ts">
import SiteGeneralPanel from '@/components/features/site-settings/SiteGeneralPanel.vue'
import SiteSettingsContainer from '@/components/features/site-settings/SiteSettingsContainer.vue'
import { useSiteSettings } from '@/components/features/site-settings/useSiteSettings'
import { parseSiteId } from '@/components/features/site-settings/site-settings.utils'
import type { SiteSettingsDraft } from '@/components/features/site-settings/site-settings.types'

const route = useRoute()
const siteId = computed(() => parseSiteId(route.params.siteId))
const { snapshot, retry, save } = useSiteSettings({ siteId })
const site = computed(() => ('site' in snapshot.value.load ? snapshot.value.load.site : undefined))

async function handleSave(draft: SiteSettingsDraft): Promise<void> {
  try {
    await save(draft)
  } catch {
    return
  }
}
</script>

<template>
  <SiteSettingsContainer :retry="retry" :snapshot="snapshot">
    <SiteGeneralPanel v-if="site" :save-state="snapshot.save" :site="site" @save="handleSave" />
  </SiteSettingsContainer>
</template>
