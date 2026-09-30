<script setup lang="ts">
import { computed, nextTick, shallowRef } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import CollectionClearOverrideDialog from './CollectionClearOverrideDialog.vue'
import CollectionPolicyCaptureFields from './CollectionPolicyCaptureFields.vue'
import CollectionPolicyExclusionFields from './CollectionPolicyExclusionFields.vue'
import CollectionPolicyPrivacySummary from './CollectionPolicyPrivacySummary.vue'
import CollectionPolicyPropertyFields from './CollectionPolicyPropertyFields.vue'
import CollectionPolicySummary from './CollectionPolicySummary.vue'
import type { CollectionFieldPatch, CollectionPolicyEditorView } from './collection-policy.types'
import { focusTargetId } from './collection-policy.utils'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const emit = defineEmits<{
  beginEdit: []
  cancelEdit: []
  patch: [patch: CollectionFieldPatch]
  save: []
  confirmClear: []
}>()

const clearRequested = shallowRef(false)

const editing = computed(() => props.editor.mode === 'edit')
const busy = computed(() => props.editor.saving)

function startEdit(): void {
  emit('beginEdit')
}

function cancel(): void {
  clearRequested.value = false
  emit('cancelEdit')
}

function requestClear(): void {
  clearRequested.value = true
}

function cancelClear(): void {
  clearRequested.value = false
}

function confirmClear(): void {
  clearRequested.value = false
  emit('confirmClear')
}

function submit(): void {
  if (props.editor.validation.kind !== 'invalid') {
    emit('save')
    return
  }
  const firstInvalid = Object.keys(props.editor.validation.validation.fieldErrors)[0]
  if (firstInvalid === undefined) return
  void nextTick(() => document.getElementById(focusTargetId(firstInvalid))?.focus())
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle><h2>Site collection policy</h2></CardTitle>
      <CardAction v-if="!editing">
        <Button type="button" :disabled="!editor.canEdit" @click="startEdit">
          Edit Site override
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent class="grid min-w-0 gap-6">
      <CollectionPolicySummary v-if="!editing" :editor="editor" />

      <form v-else class="grid min-w-0 gap-6" novalidate @submit.prevent="submit">
        <CollectionPolicyCaptureFields :editor="editor" @patch="emit('patch', $event)" />
        <CollectionPolicyPropertyFields :editor="editor" @patch="emit('patch', $event)" />
        <CollectionPolicyExclusionFields :editor="editor" @patch="emit('patch', $event)" />
      </form>

      <CollectionPolicyPrivacySummary :editor="editor" />
    </CardContent>
    <CardFooter class="flex-col items-start gap-3">
      <p v-if="editor.disabledReason" class="text-muted-foreground text-sm" role="status">
        {{ editor.disabledReason }}
      </p>
      <p v-else-if="editing && editor.dirty" class="text-muted-foreground text-sm" role="status">
        Review the privacy summary before saving.
      </p>
      <p v-else-if="editing" class="text-muted-foreground text-sm" role="status">
        No changes to save yet.
      </p>

      <div v-if="editing" class="flex flex-wrap gap-2">
        <Button type="button" :disabled="!editor.canSubmit" @click="submit">
          <Spinner v-if="busy && editor.operation === 'save'" aria-hidden="true" />
          {{ busy && editor.operation === 'save' ? 'Saving…' : 'Save Site override' }}
        </Button>
        <Button type="button" variant="outline" :disabled="busy" @click="cancel">Cancel</Button>
        <Button
          v-if="editor.hasOverride"
          type="button"
          variant="destructive"
          :disabled="!editor.canClear"
          @click="requestClear"
        >
          Clear override
        </Button>
      </div>
    </CardFooter>
  </Card>

  <CollectionClearOverrideDialog
    :busy="busy && editor.operation === 'clear'"
    :requested="clearRequested"
    @cancel="cancelClear"
    @confirm="confirmClear"
  />
</template>
