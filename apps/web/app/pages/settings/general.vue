<script setup lang="ts">
import OrganizationGeneralPanel from '@/components/features/organization-settings/OrganizationGeneralPanel.vue'
import OrganizationSettingsContainer from '@/components/features/organization-settings/OrganizationSettingsContainer.vue'
import { useOrganizationSettings } from '@/components/features/organization-settings/useOrganizationSettings'

const { activeOrganizationId } = useWorkspaceSelection()
const { snapshot, isMutating, error, updateName } = useOrganizationSettings({
  section: 'general',
  organizationId: activeOrganizationId,
})
</script>

<template>
  <OrganizationSettingsContainer :snapshot="snapshot">
    <OrganizationGeneralPanel
      v-if="snapshot.organization"
      :organization="snapshot.organization"
      :is-saving="isMutating"
      :error="error"
      @save="updateName"
    />
  </OrganizationSettingsContainer>
</template>
