<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  EditableMemberRole,
  OrganizationMember,
  OrganizationSettingsSnapshot,
} from './organization-settings.types'
import { formatSettingsDate } from './organization-settings.utils'

const props = defineProps<{
  snapshot: OrganizationSettingsSnapshot
  isMutating: boolean
}>()

const emit = defineEmits<{
  changeRole: [input: { readonly userId: string; readonly role: EditableMemberRole }]
  removeMember: [member: OrganizationMember]
  transferOwnership: [member: OrganizationMember]
}>()

const canManage = computed(() => {
  const role = props.snapshot.currentMembership?.role
  return role === 'owner' || role === 'admin'
})

const members = computed(() => props.snapshot.members?.items ?? [])

function roleLabel(role: OrganizationMember['role']): string {
  if (role === 'owner') return 'Owner'
  return role === 'admin' ? 'Administrator' : 'Member'
}

function changeRole(userId: string, value: unknown): void {
  if (value !== 'admin' && value !== 'member') return
  emit('changeRole', { userId, role: value })
}
</script>

<template>
  <div
    v-if="snapshot.members === undefined && snapshot.isLoading"
    class="text-muted-foreground flex items-center gap-2 text-sm"
  >
    <Spinner aria-hidden="true" />
    Loading members...
  </div>
  <Table v-else class="min-w-[680px]">
    <TableCaption>{{ snapshot.members?.totalCount ?? 0 }} organization members.</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead scope="col">Email</TableHead>
        <TableHead scope="col">Role</TableHead>
        <TableHead scope="col">Joined</TableHead>
        <TableHead scope="col" class="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="members.length === 0" :colspan="4">No members found.</TableEmpty>
      <TableRow v-for="member in members" v-else :key="member.userId">
        <TableCell class="font-medium">
          <span class="flex items-center gap-2">
            {{ member.email }}
            <Badge v-if="member.userId === snapshot.currentUserId" variant="secondary">You</Badge>
          </span>
        </TableCell>
        <TableCell>
          <Badge v-if="member.role === 'owner'" variant="outline">
            {{ roleLabel(member.role) }}
          </Badge>
          <UISelect
            v-else
            :model-value="member.role"
            :disabled="!canManage || isMutating"
            @update:model-value="(value) => changeRole(member.userId, value)"
          >
            <UISelectTrigger class="w-36" :aria-label="`Role for ${member.email}`">
              <UISelectValue />
            </UISelectTrigger>
            <UISelectContent>
              <UISelectItem value="member">Member</UISelectItem>
              <UISelectItem value="admin">Administrator</UISelectItem>
            </UISelectContent>
          </UISelect>
        </TableCell>
        <TableCell>{{ formatSettingsDate(member.createdAt) }}</TableCell>
        <TableCell class="text-right">
          <div
            v-if="canManage && member.role !== 'owner' && member.userId !== snapshot.currentUserId"
            class="flex justify-end gap-1"
          >
            <Button
              v-if="snapshot.isOwner"
              :aria-label="`Transfer ownership to ${member.email}`"
              :disabled="isMutating"
              size="sm"
              type="button"
              variant="ghost"
              @click="emit('transferOwnership', member)"
            >
              Transfer ownership
            </Button>
            <Button
              :aria-label="`Remove ${member.email} from the organization`"
              :disabled="isMutating"
              size="sm"
              type="button"
              variant="ghost"
              @click="emit('removeMember', member)"
            >
              Remove
            </Button>
          </div>
          <span v-else class="text-muted-foreground text-sm">-</span>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
