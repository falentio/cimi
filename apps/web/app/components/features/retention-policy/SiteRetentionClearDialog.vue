<script setup lang="ts">
import { computed } from 'vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { RetentionPolicy } from './retention-policy.types'
import { retentionPolicyRows } from './retention-policy.utils'

const props = defineProps<{
  open: boolean
  installationDefault: RetentionPolicy
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const open = computed({
  get: () => props.open,
  set: (value: boolean) => {
    if (!value) emit('cancel')
  },
})

const rows = computed(() => retentionPolicyRows(props.installationDefault))
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Clear the Site retention override?</AlertDialogTitle>
        <AlertDialogDescription>
          This Site stops using its own override and inherits the installation default again. The
          installation default replaces the override wholesale, so it can be longer or shorter than
          the override it replaces.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="grid gap-3 rounded-md border p-4 text-sm">
        <div class="font-medium">Inherited installation default</div>
        <dl class="grid gap-3">
          <div v-for="row in rows" :key="row.label" class="flex flex-wrap justify-between gap-2">
            <dt class="text-muted-foreground">{{ row.label }}</dt>
            <dd class="tabular-nums">{{ row.value }}</dd>
          </div>
        </dl>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel type="button" @click="emit('cancel')">Keep override</AlertDialogCancel>
        <AlertDialogAction type="button" variant="destructive" @click="emit('confirm')">
          Clear override
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
