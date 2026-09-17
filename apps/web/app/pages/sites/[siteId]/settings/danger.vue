<script setup lang="ts">
import SiteDangerPanel from '@/components/features/site-settings/SiteDangerPanel.vue'
import SiteSettingsContainer from '@/components/features/site-settings/SiteSettingsContainer.vue'
import { useSiteSettings } from '@/components/features/site-settings/useSiteSettings'
import { parseSiteId } from '@/components/features/site-settings/site-settings.utils'

const route = useRoute()
const router = useRouter()
const siteId = computed(() => parseSiteId(route.params.siteId))
const { snapshot, retry, beginDelete, cancelDelete, confirmDelete } = useSiteSettings({ siteId })
const site = computed(() => ('site' in snapshot.value.load ? snapshot.value.load.site : undefined))

async function handleDelete(): Promise<void> {
  try {
    await confirmDelete()
    await router.push('/')
  } catch {
    return
  }
}
</script>

<template>
  <SiteSettingsContainer :retry="retry" :snapshot="snapshot">
    <SiteDangerPanel
      v-if="site"
      :deletion-state="snapshot.deletion"
      :site="site"
      @begin-delete="beginDelete"
      @cancel-delete="cancelDelete"
      @confirm-delete="handleDelete"
    />
  </SiteSettingsContainer>
</template>
