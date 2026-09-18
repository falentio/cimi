<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { AlertCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import OrganizationInvitationsPanel from './OrganizationInvitationsPanel.vue'
import OrganizationMembershipConfirmationDialog from './OrganizationMembershipConfirmationDialog.vue'
import OrganizationMembersTable from './OrganizationMembersTable.vue'
import type {
  CreatedInvitation,
  EditableMemberRole,
  OrganizationMember,
  OrganizationSettingsSnapshot,
} from './organization-settings.types'
import type { MembershipConfirmation } from './OrganizationMembershipConfirmationDialog.vue'
import { useLocalizedErrorMessage } from '@/composables/useLocalizedErrorMessage'

const props = defineProps<{
  snapshot: OrganizationSettingsSnapshot
  isMutating: boolean
  createdInvitation: CreatedInvitation | undefined
}>()

const emit = defineEmits<{
  changeRole: [input: { readonly userId: string; readonly role: EditableMemberRole }]
  removeMember: [userId: string]
  transferOwnership: [userId: string]
  leave: []
  createInvitation: [role: EditableMemberRole]
  revokeInvitation: [invitationId: string]
}>()

const confirmation = shallowRef<MembershipConfirmation | undefined>()
const localizeError = useLocalizedErrorMessage()
const confirmationOpen = computed({
  get: () => confirmation.value !== undefined,
  set: (open: boolean) => {
    if (!open) confirmation.value = undefined
  },
})

const canManage = computed(() => {
  const role = props.snapshot.currentMembership?.role
  return role === 'owner' || role === 'admin'
})

function askRemove(member: OrganizationMember): void {
  confirmation.value = { kind: 'remove', userId: member.userId, label: member.email }
}

function askTransfer(member: OrganizationMember): void {
  confirmation.value = { kind: 'transfer', userId: member.userId, label: member.email }
}

function askLeave(): void {
  confirmation.value = {
    kind: 'leave',
    label: props.snapshot.organization?.name ?? 'this organization',
  }
}

function confirmAction(): void {
  const action = confirmation.value
  confirmation.value = undefined
  if (action === undefined) return
  if (action.kind === 'leave') {
    emit('leave')
    return
  }
  if (action.kind === 'remove') emit('removeMember', action.userId)
  else emit('transferOwnership', action.userId)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <Card>
      <CardHeader>
        <CardTitle><h2>Members</h2></CardTitle>
        <CardDescription>Manage access for {{ snapshot.organization?.name }}.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <Alert v-if="snapshot.error" variant="destructive">
          <HugeiconsIcon :icon="AlertCircleIcon" aria-hidden="true" />
          <AlertTitle>Member settings could not be updated</AlertTitle>
          <AlertDescription>{{ localizeError(snapshot.error) }}</AlertDescription>
        </Alert>
        <OrganizationMembersTable
          :is-mutating="isMutating"
          :snapshot="snapshot"
          @change-role="emit('changeRole', $event)"
          @remove-member="askRemove"
          @transfer-ownership="askTransfer"
        />

        <Button
          v-if="snapshot.currentMembership && snapshot.currentMembership.role !== 'owner'"
          class="self-start"
          :disabled="isMutating"
          type="button"
          variant="outline"
          @click="askLeave"
        >
          Leave organization
        </Button>
      </CardContent>
    </Card>

    <OrganizationInvitationsPanel
      v-if="canManage"
      :created-invitation="createdInvitation"
      :is-mutating="isMutating"
      :snapshot="snapshot"
      @create-invitation="emit('createInvitation', $event)"
      @revoke-invitation="emit('revokeInvitation', $event)"
    />

    <OrganizationMembershipConfirmationDialog
      v-model:open="confirmationOpen"
      :confirmation="confirmation"
      :is-mutating="isMutating"
      @confirm="confirmAction"
    />
  </div>
</template>
