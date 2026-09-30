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

const props = defineProps<{ requested: boolean; busy: boolean }>()

const emit = defineEmits<{ cancel: []; confirm: [] }>()

const open = computed({
  get: () => props.requested || props.busy,
  set: (value: boolean) => {
    if (!value && !props.busy) emit('cancel')
  },
})
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Clear the Site collection override?</AlertDialogTitle>
        <AlertDialogDescription>
          This deletes the stored Site layer for this Site. The Site then inherits the installation
          default again, including any later change to that default. Clearing can reduce privacy
          relative to the current override when the installation default collects more.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel type="button" :disabled="busy" @click="emit('cancel')">
          Keep the override
        </AlertDialogCancel>
        <Button type="button" variant="destructive" :disabled="busy" @click="emit('confirm')">
          <Spinner v-if="busy" aria-hidden="true" />
          {{ busy ? 'Clearing…' : 'Clear override' }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
