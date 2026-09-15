<script setup lang="ts">
import { shallowRef } from 'vue'
import OrganizationMembersPanel from '@/components/features/organization-settings/OrganizationMembersPanel.vue'
import OrganizationSettingsContainer from '@/components/features/organization-settings/OrganizationSettingsContainer.vue'
import { useOrganizationSettings } from '@/components/features/organization-settings/useOrganizationSettings'
import type {
  CreatedInvitation,
  EditableMemberRole,
} from '@/components/features/organization-settings/organization-settings.types'

const { activeOrganizationId } = useWorkspaceSelection()
const {
  snapshot,
  isMutating,
  changeMemberRole,
  removeMember,
  transferOwnership,
  leaveOrganization,
  createInvitation,
  revokeInvitation,
} = useOrganizationSettings({
  section: 'members',
  organizationId: activeOrganizationId,
})
const createdInvitation = shallowRef<CreatedInvitation | undefined>()

async function handleCreateInvitation(role: EditableMemberRole): Promise<void> {
  try {
    createdInvitation.value = await createInvitation(role)
  } catch {
    // The feature gateway exposes the normalized error through the snapshot.
  }
}
</script>

<template>
  <OrganizationSettingsContainer :snapshot="snapshot">
    <OrganizationMembersPanel
      v-if="snapshot.organization"
      :created-invitation="createdInvitation"
      :is-mutating="isMutating"
      :snapshot="snapshot"
      @change-role="changeMemberRole"
      @create-invitation="handleCreateInvitation"
      @leave="leaveOrganization"
      @remove-member="removeMember"
      @revoke-invitation="revokeInvitation"
      @transfer-ownership="transferOwnership"
    />
  </OrganizationSettingsContainer>
</template>
