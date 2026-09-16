<script setup lang="ts">
import OrganizationGeneralPanel from '@/components/features/organization-settings/OrganizationGeneralPanel.vue'
import OrganizationSettingsContainer from '@/components/features/organization-settings/OrganizationSettingsContainer.vue'
import { useOrganizationSettings } from '@/components/features/organization-settings/useOrganizationSettings'

const { activeOrganizationId } = useWorkspaceSelection()
const { snapshot, isMutating, error, refresh, updateName } = useOrganizationSettings({
  section: 'general',
  organizationId: activeOrganizationId,
})

async function saveName(input: Parameters<typeof updateName>[0]): Promise<void> {
  try {
    await updateName(input)
  } catch {
    return
  }
}
</script>

<template>
  <OrganizationSettingsContainer :refresh="refresh" :snapshot="snapshot">
    <OrganizationGeneralPanel
      v-if="snapshot.organization"
      :organization="snapshot.organization"
      :is-saving="isMutating"
      :error="error"
      @save="saveName"
    />
  </OrganizationSettingsContainer>
</template>
