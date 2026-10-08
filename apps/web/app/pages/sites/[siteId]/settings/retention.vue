<script setup lang="ts">
import SiteRetentionPanel from '@/components/features/retention-policy/SiteRetentionPanel.vue'
import { useSiteRetention } from '@/components/features/retention-policy/useSiteRetention'
import type {
  RetentionField,
  RetentionPolicy,
} from '@/components/features/retention-policy/retention-policy.types'
import SiteSettingsContainer from '@/components/features/site-settings/SiteSettingsContainer.vue'
import { useSiteSettings } from '@/components/features/site-settings/useSiteSettings'
import { parseSiteId } from '@/components/features/site-settings/site-settings.utils'

const route = useRoute()

const siteId = computed(() => parseSiteId(route.params.siteId))

const { snapshot, retry } = useSiteSettings({ siteId })

const controller = useSiteRetention({ siteId })

const view = computed(() => controller.view.value)

async function refresh(): Promise<void> {
  await controller.refresh()
}

async function submit(policy: RetentionPolicy): Promise<void> {
  await controller.submit(policy)
}

async function clear(): Promise<void> {
  await controller.clear()
}

async function confirmShortening(confirmation: string): Promise<void> {
  await controller.confirmShortening(confirmation)
}

function fieldChange(field: RetentionField, value: string): void {
  controller.edit(field, value)
}
</script>

<template>
  <SiteSettingsContainer :retry="retry" :snapshot="snapshot">
    <SiteRetentionPanel
      :site-id="siteId"
      :view="view"
      @cancel-confirmation="controller.cancelConfirmation"
      @clear="clear"
      @confirm-shortening="confirmShortening"
      @field-change="fieldChange"
      @refresh="refresh"
      @submit="submit"
    />
  </SiteSettingsContainer>
</template>
