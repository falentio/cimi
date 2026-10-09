<script setup lang="ts">
import { computed } from 'vue'
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
import { Spinner } from '@/components/ui/spinner'
import type { PublicDashboardCommand } from './public-dashboard.types'
import { PUBLIC_DASHBOARD_OPERATION_COPY } from './public-dashboard.utils'

const props = defineProps<{ command: PublicDashboardCommand }>()

const emit = defineEmits<{ cancel: []; confirm: [] }>()

const copy = computed(() =>
  props.command.kind === 'idle' ? null : PUBLIC_DASHBOARD_OPERATION_COPY[props.command.operation],
)

const submitting = computed(() => props.command.kind === 'submitting')

const open = computed({
  get: () => props.command.kind === 'confirming' || props.command.kind === 'submitting',
  set: (value: boolean) => {
    if (!value && !submitting.value) emit('cancel')
  },
})
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent v-if="copy">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ copy.title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ copy.description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel type="button" :disabled="submitting" @click="emit('cancel')">
          Cancel
        </AlertDialogCancel>
        <Button
          type="button"
          :variant="
            command.kind === 'submitting' && command.operation === 'disable'
              ? 'destructive'
              : 'default'
          "
          :disabled="submitting"
          @click="emit('confirm')"
        >
          <Spinner v-if="submitting" aria-hidden="true" />
          {{ submitting ? 'Applying…' : copy.confirmLabel }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
