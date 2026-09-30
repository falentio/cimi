<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { AlertCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { OrganizationSettingsSnapshot } from './organization-settings.types'
import { useLocalizedErrorMessage } from '@/composables/useLocalizedErrorMessage'

const props = defineProps<{
  snapshot: OrganizationSettingsSnapshot
  isMutating: boolean
}>()

const emit = defineEmits<{
  deleteOrganization: []
  leaveOrganization: []
}>()

const confirmationOpen = shallowRef(false)
const action = computed(() => (props.snapshot.isOwner ? 'delete' : 'leave'))
const localizeError = useLocalizedErrorMessage()

function confirmAction(): void {
  confirmationOpen.value = false
  if (action.value === 'delete') emit('deleteOrganization')
  else emit('leaveOrganization')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <Card>
      <CardHeader>
        <CardTitle><h2>Danger zone</h2></CardTitle>
        <CardDescription>These actions change access for the entire organization.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <Alert variant="destructive">
          <HugeiconsIcon :icon="AlertCircleIcon" aria-hidden="true" />
          <AlertTitle>{{
            snapshot.isOwner ? 'Delete organization' : 'Leave organization'
          }}</AlertTitle>
          <AlertDescription>
            <template v-if="snapshot.isOwner">
              Deletion is only available when the organization has no Sites or other blocking data.
            </template>
            <template v-else>
              Leaving removes your access. An Owner must transfer ownership before leaving.
            </template>
          </AlertDescription>
        </Alert>
        <p v-if="snapshot.error" class="text-destructive text-sm" role="alert">
          {{ localizeError(snapshot.error) }}
        </p>
        <Button
          class="self-start"
          :disabled="isMutating"
          type="button"
          variant="destructive"
          @click="confirmationOpen = true"
        >
          {{ snapshot.isOwner ? 'Delete organization' : 'Leave organization' }}
        </Button>
      </CardContent>
    </Card>

    <UIAlertDialog v-model:open="confirmationOpen">
      <UIAlertDialogContent>
        <UIAlertDialogHeader>
          <UIAlertDialogTitle>{{
            action === 'delete' ? 'Delete organization?' : 'Leave organization?'
          }}</UIAlertDialogTitle>
          <UIAlertDialogDescription>
            <template v-if="action === 'delete'">
              This cannot be completed while the organization owns Sites. Confirm only if you intend
              to remove this organization.
            </template>
            <template v-else>
              You will lose access to this organization until you are invited again.
            </template>
          </UIAlertDialogDescription>
        </UIAlertDialogHeader>
        <UIAlertDialogFooter>
          <UIAlertDialogCancel>Cancel</UIAlertDialogCancel>
          <UIAlertDialogAction variant="destructive" :disabled="isMutating" @click="confirmAction">
            {{ action === 'delete' ? 'Delete organization' : 'Leave organization' }}
          </UIAlertDialogAction>
        </UIAlertDialogFooter>
      </UIAlertDialogContent>
    </UIAlertDialog>
  </div>
</template>
