<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { RestoreSectionView } from './backup-restore.types'
import { formatBackupDate } from './backup-restore.utils'

const props = defineProps<{ section: RestoreSectionView }>()

const emit = defineEmits<{
  cancel: []
  confirm: [confirmation: string]
}>()

const confirmation = shallowRef('')
const open = computed({
  get: () => props.section.kind === 'confirming' || props.section.kind === 'submitting',
  set: (value: boolean) => {
    if (!value) emit('cancel')
  },
})
const selectedId = computed(() => {
  if (
    props.section.kind === 'confirming' ||
    props.section.kind === 'submitting' ||
    props.section.kind === 'tracking'
  ) {
    return props.section.selected.id
  }
  return null
})
const confirmationBlocked = computed(() => {
  if (props.section.kind !== 'confirming' && props.section.kind !== 'submitting') return false
  return !props.section.confirmation.canConfirm
})
const confirmationDescribedBy = computed(() =>
  [
    'backup-restore-confirmation-description',
    ...(props.section.kind === 'confirming' && props.section.error !== null
      ? ['backup-restore-confirmation-error']
      : []),
    ...(confirmationBlocked.value ? ['backup-restore-confirmation-disabled'] : []),
  ].join(' '),
)

watch(selectedId, (next, previous) => {
  if (next !== previous) confirmation.value = ''
})

function submit(): void {
  if (props.section.kind !== 'confirming' || !props.section.confirmation.canConfirm) return
  emit('confirm', confirmation.value)
}
</script>

<template>
  <AlertDialog
    v-if="section.kind === 'confirming' || section.kind === 'submitting'"
    v-model:open="open"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm restore</AlertDialogTitle>
        <AlertDialogDescription>
          Restoring the source backup created
          <time :datetime="section.selected.createdAt">{{
            formatBackupDate(section.selected.createdAt)
          }}</time>
          replaces the current installation data after the server prepares a safety artifact. This
          action cannot be undone from this page.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <p
        v-if="!section.confirmation.canConfirm"
        id="backup-restore-confirmation-disabled"
        class="rounded-md border px-3 py-2 text-sm"
        role="status"
      >
        {{ section.confirmation.confirmDisabledReason }}
      </p>
      <form class="space-y-4" @submit.prevent="submit">
        <Field :data-invalid="section.kind === 'confirming' && section.error !== null">
          <FieldLabel for="backup-restore-confirmation">Confirmation</FieldLabel>
          <Input
            id="backup-restore-confirmation"
            v-model="confirmation"
            name="confirmation"
            autocomplete="off"
            spellcheck="false"
            :aria-describedby="confirmationDescribedBy"
            :aria-invalid="section.kind === 'confirming' && section.error !== null"
            :disabled="section.kind === 'submitting'"
          />
          <FieldDescription id="backup-restore-confirmation-description">
            Type RESTORE in uppercase with no extra spaces.
          </FieldDescription>
          <FieldError
            v-if="section.kind === 'confirming' && section.error"
            id="backup-restore-confirmation-error"
            :errors="[section.error.message]"
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel
            type="button"
            :disabled="section.kind === 'submitting'"
            @click="emit('cancel')"
          >
            Cancel
          </AlertDialogCancel>
          <Button type="submit" variant="destructive" :disabled="!section.confirmation.canConfirm">
            <Spinner v-if="section.kind === 'submitting'" aria-hidden="true" />
            {{ section.kind === 'submitting' ? 'Starting restore' : 'Restore backup' }}
          </Button>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  </AlertDialog>
</template>
