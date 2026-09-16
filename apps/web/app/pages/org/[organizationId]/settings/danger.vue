<script setup lang="ts">
import OrganizationDangerPanel from '@/components/features/organization-settings/OrganizationDangerPanel.vue'
import OrganizationSettingsContainer from '@/components/features/organization-settings/OrganizationSettingsContainer.vue'
import { useOrganizationSettings } from '@/components/features/organization-settings/useOrganizationSettings'

const { activeOrganizationId } = useWorkspaceSelection()
const { snapshot, isMutating, refresh, leaveOrganization, deleteOrganization } =
  useOrganizationSettings({
    section: 'danger',
    organizationId: activeOrganizationId,
  })

async function handleLeave(): Promise<void> {
  try {
    await leaveOrganization()
  } catch {
    return
  }
}

async function handleDelete(): Promise<void> {
  try {
    await deleteOrganization()
  } catch {
    return
  }
}
</script>

<template>
  <OrganizationSettingsContainer :refresh="refresh" :snapshot="snapshot">
    <OrganizationDangerPanel
      v-if="snapshot.organization"
      :is-mutating="isMutating"
      :snapshot="snapshot"
      @delete-organization="handleDelete"
      @leave-organization="handleLeave"
    />
  </OrganizationSettingsContainer>
</template>
