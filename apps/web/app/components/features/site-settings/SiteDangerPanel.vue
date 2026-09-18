<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import type { Site, SiteDeletionState } from './site-settings.types'
import { useLocalizedErrorMessage } from '@/composables/useLocalizedErrorMessage'

const props = defineProps<{
  site: Site
  deletionState: SiteDeletionState
}>()

const emit = defineEmits<{
  beginDelete: []
  cancelDelete: []
  confirmDelete: []
}>()

const confirmationOpen = computed({
  get: () =>
    props.deletionState.status === 'confirming' || props.deletionState.status === 'submitting',
  set: (open: boolean) => {
    if (!open && props.deletionState.status === 'confirming') emit('cancelDelete')
  },
})
const isSubmitting = computed(() => props.deletionState.status === 'submitting')
const isAccepted = computed(() => props.deletionState.status === 'accepted')
const localizeError = useLocalizedErrorMessage()
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle><h2>Danger zone</h2></CardTitle>
      <CardDescription>These actions affect data collection for {{ site.name }}.</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <Alert variant="destructive">
        <HugeiconsIcon :icon="AlertCircleIcon" aria-hidden="true" />
        <AlertTitle>Delete site</AlertTitle>
        <AlertDescription>
          Stop collecting data and begin the recoverable deletion process for this site.
        </AlertDescription>
      </Alert>

      <p v-if="deletionState.status === 'error'" class="text-destructive text-sm" role="alert">
        {{ localizeError(deletionState.error) }}
      </p>
      <p v-if="deletionState.status === 'accepted'" class="text-sm" role="status">
        Deletion started. The site is recoverable until the server's purge deadline.
      </p>
      <p
        v-if="deletionState.status === 'accepted' && deletionState.warning"
        class="text-muted-foreground text-sm"
        role="status"
      >
        {{ localizeError(deletionState.warning) }}
      </p>

      <Button
        v-if="!isAccepted"
        class="self-start"
        :disabled="isSubmitting"
        type="button"
        variant="destructive"
        @click="emit('beginDelete')"
      >
        <Spinner v-if="isSubmitting" aria-hidden="true" />
        {{ isSubmitting ? 'Starting deletion…' : 'Delete site' }}
      </Button>
    </CardContent>
  </Card>

  <UIAlertDialog v-model:open="confirmationOpen">
    <UIAlertDialogContent>
      <UIAlertDialogHeader>
        <UIAlertDialogTitle>Delete {{ site.name }}?</UIAlertDialogTitle>
        <UIAlertDialogDescription>
          This stops data collection and starts an asynchronous deletion. The site remains
          recoverable until the server's purge deadline, so this is not an immediate permanent
          erase.
        </UIAlertDialogDescription>
      </UIAlertDialogHeader>
      <UIAlertDialogFooter>
        <UIAlertDialogCancel :disabled="isSubmitting">Cancel</UIAlertDialogCancel>
        <UIAlertDialogAction
          variant="destructive"
          :disabled="isSubmitting"
          @click="emit('confirmDelete')"
        >
          <Spinner v-if="isSubmitting" aria-hidden="true" />
          {{ isSubmitting ? 'Starting deletion…' : 'Delete site' }}
        </UIAlertDialogAction>
      </UIAlertDialogFooter>
    </UIAlertDialogContent>
  </UIAlertDialog>
</template>
