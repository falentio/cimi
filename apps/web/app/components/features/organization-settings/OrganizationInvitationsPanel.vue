<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { formatSettingsDate } from './organization-settings.utils'
import type {
  CreatedInvitation,
  EditableMemberRole,
  OrganizationSettingsSnapshot,
} from './organization-settings.types'

const props = defineProps<{
  snapshot: OrganizationSettingsSnapshot
  isMutating: boolean
  createdInvitation: CreatedInvitation | undefined
}>()

const emit = defineEmits<{
  createInvitation: [role: EditableMemberRole]
  revokeInvitation: [invitationId: string]
}>()

const role = shallowRef<EditableMemberRole>('member')
const copyStatus = shallowRef<string | null>(null)

const inviteUrl = computed(() => {
  const token = props.createdInvitation?.token
  return token === undefined ? null : `/invite/${token}`
})

const pendingInvitations = computed(
  () =>
    props.snapshot.invitations?.items.filter((invitation) => invitation.status === 'pending') ?? [],
)

function submitInvitation(): void {
  copyStatus.value = null
  emit('createInvitation', role.value)
}

async function copyInviteUrl(): Promise<void> {
  if (inviteUrl.value === null || navigator.clipboard === undefined) {
    copyStatus.value = 'Copy is unavailable in this browser.'
    return
  }

  try {
    await navigator.clipboard.writeText(`${globalThis.location.origin}${inviteUrl.value}`)
    copyStatus.value = 'Invitation link copied.'
  } catch {
    copyStatus.value = 'Copy failed. Select the link and copy it manually.'
  }
}

function invitationStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Invitations</CardTitle>
      <CardDescription>Invite people with a role-specific, single-use link.</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-5">
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="submitInvitation">
        <div class="flex flex-1 flex-col gap-2">
          <label for="invitation-role" class="text-sm font-medium">Role</label>
          <UISelect v-model="role" :disabled="isMutating">
            <UISelectTrigger id="invitation-role" class="w-full" aria-label="Invitation role">
              <UISelectValue />
            </UISelectTrigger>
            <UISelectContent>
              <UISelectItem value="member">Member</UISelectItem>
              <UISelectItem value="admin">Administrator</UISelectItem>
            </UISelectContent>
          </UISelect>
        </div>
        <Button :disabled="isMutating" type="submit">
          <Spinner v-if="isMutating" aria-hidden="true" />
          Create invitation
        </Button>
      </form>

      <div v-if="inviteUrl" class="border-border flex flex-col gap-2 rounded-lg border p-3">
        <p class="text-sm font-medium">New invitation link</p>
        <code class="bg-muted overflow-x-auto rounded px-2 py-1 text-xs">{{ inviteUrl }}</code>
        <div class="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" @click="copyInviteUrl">
            Copy link
          </Button>
          <p v-if="copyStatus" class="text-muted-foreground text-sm" role="status">
            {{ copyStatus }}
          </p>
        </div>
        <p class="text-muted-foreground text-xs">The token is shown only once.</p>
      </div>

      <div
        v-if="snapshot.invitations === undefined && snapshot.isLoading"
        class="text-muted-foreground flex items-center gap-2 text-sm"
      >
        <Spinner aria-hidden="true" />
        Loading invitations...
      </div>
      <p v-else-if="pendingInvitations.length === 0" class="text-muted-foreground text-sm">
        No pending invitations.
      </p>
      <ul v-else class="flex flex-col gap-2" aria-label="Pending invitations">
        <li
          v-for="invitation in pendingInvitations"
          :key="invitation.id"
          class="border-border flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium"
              >{{ invitationStatusLabel(invitation.status) }} {{ invitation.role }}</span
            >
            <span class="text-muted-foreground text-xs"
              >Expires {{ formatSettingsDate(invitation.expiresAt) }}</span
            >
          </div>
          <Button
            :disabled="isMutating"
            size="sm"
            type="button"
            variant="ghost"
            @click="emit('revokeInvitation', invitation.id)"
          >
            Revoke
          </Button>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
