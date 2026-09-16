<script setup lang="ts">
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export type MembershipConfirmation =
  | { readonly kind: 'remove' | 'transfer'; readonly userId: string; readonly label: string }
  | { readonly kind: 'leave'; readonly label: string }

defineProps<{
  confirmation: MembershipConfirmation | undefined
  isMutating: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  confirm: []
}>()
</script>

<template>
  <UIAlertDialog v-model:open="open">
    <UIAlertDialogContent>
      <UIAlertDialogHeader>
        <UIAlertDialogTitle>
          {{
            confirmation?.kind === 'leave'
              ? 'Leave organization?'
              : confirmation?.kind === 'transfer'
                ? 'Transfer ownership?'
                : 'Remove member?'
          }}
        </UIAlertDialogTitle>
        <UIAlertDialogDescription>
          <template v-if="confirmation?.kind === 'leave'">
            You will lose access to {{ confirmation.label }} until you are invited again.
          </template>
          <template v-else-if="confirmation?.kind === 'transfer'">
            {{ confirmation.label }} will become the owner, and you will remain an administrator.
          </template>
          <template v-else>
            {{ confirmation?.label }} will lose access to this organization.
          </template>
        </UIAlertDialogDescription>
      </UIAlertDialogHeader>
      <UIAlertDialogFooter>
        <UIAlertDialogCancel>Cancel</UIAlertDialogCancel>
        <UIAlertDialogAction variant="destructive" :disabled="isMutating" @click="emit('confirm')">
          {{
            confirmation?.kind === 'leave'
              ? 'Leave organization'
              : confirmation?.kind === 'transfer'
                ? 'Transfer ownership'
                : 'Remove member'
          }}
        </UIAlertDialogAction>
      </UIAlertDialogFooter>
    </UIAlertDialogContent>
  </UIAlertDialog>
</template>
