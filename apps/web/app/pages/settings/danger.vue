<script setup lang="ts">
import OrganizationDangerPanel from '@/components/features/organization-settings/OrganizationDangerPanel.vue'
import OrganizationSettingsContainer from '@/components/features/organization-settings/OrganizationSettingsContainer.vue'
import { useOrganizationSettings } from '@/components/features/organization-settings/useOrganizationSettings'

const { activeOrganizationId } = useWorkspaceSelection()
const { snapshot, isMutating, leaveOrganization, deleteOrganization } = useOrganizationSettings({
  section: 'danger',
  organizationId: activeOrganizationId,
})
</script>

<template>
  <OrganizationSettingsContainer :snapshot="snapshot">
    <OrganizationDangerPanel
      v-if="snapshot.organization"
      :is-mutating="isMutating"
      :snapshot="snapshot"
      @delete-organization="deleteOrganization"
      @leave-organization="leaveOrganization"
    />
  </OrganizationSettingsContainer>
</template>
