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
  refresh,
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
  createdInvitation.value = undefined
  try {
    createdInvitation.value = await createInvitation(role)
  } catch {
    return
  }
}

async function handleChangeRole(input: {
  readonly userId: string
  readonly role: EditableMemberRole
}): Promise<void> {
  try {
    await changeMemberRole(input)
  } catch {
    return
  }
}

async function handleRemoveMember(userId: string): Promise<void> {
  try {
    await removeMember(userId)
  } catch {
    return
  }
}

async function handleTransferOwnership(userId: string): Promise<void> {
  try {
    await transferOwnership(userId)
  } catch {
    return
  }
}

async function handleLeave(): Promise<void> {
  try {
    await leaveOrganization()
  } catch {
    return
  }
}

async function handleRevokeInvitation(invitationId: string): Promise<void> {
  try {
    await revokeInvitation(invitationId)
  } catch {
    return
  }
}
</script>

<template>
  <OrganizationSettingsContainer :refresh="refresh" :snapshot="snapshot">
    <OrganizationMembersPanel
      v-if="snapshot.organization"
      :created-invitation="createdInvitation"
      :is-mutating="isMutating"
      :snapshot="snapshot"
      @change-role="handleChangeRole"
      @create-invitation="handleCreateInvitation"
      @leave="handleLeave"
      @remove-member="handleRemoveMember"
      @revoke-invitation="handleRevokeInvitation"
      @transfer-ownership="handleTransferOwnership"
    />
  </OrganizationSettingsContainer>
</template>
