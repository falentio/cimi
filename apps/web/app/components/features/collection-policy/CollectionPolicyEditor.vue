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
  <div class="grid min-w-0 gap-6">
    <Card>
      <CardHeader>
        <CardTitle><h3>Site collection policy</h3></CardTitle>
        <CardAction v-if="!editing">
          <Button type="button" :disabled="!editor.canEdit" @click="startEdit">
            Edit Site override
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent class="min-w-0">
        <CollectionPolicySummary v-if="!editing" :editor="editor" />
        <p v-else class="text-muted-foreground text-sm">
          Each section below is its own card. The Site override replaces the whole Site layer, so a
          save writes every section at once.
        </p>
      </CardContent>
    </Card>

    <template v-if="editing">
      <form class="grid min-w-0 gap-6" novalidate @submit.prevent="submit">
        <Card>
          <CardContent class="min-w-0 pt-6">
            <CollectionPolicyCaptureFields :editor="editor" @patch="emit('patch', $event)" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="min-w-0 pt-6">
            <CollectionPolicyPropertyFields :editor="editor" @patch="emit('patch', $event)" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="min-w-0 pt-6">
            <CollectionPolicyExclusionFields :editor="editor" @patch="emit('patch', $event)" />
          </CardContent>
        </Card>
      </form>
    </template>

    <CollectionPolicyPrivacySummary :editor="editor" />

    <Card>
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
          <Button type="button" :disabled="busy" @click="submit">
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
  </div>

  <CollectionClearOverrideDialog
    :busy="busy && editor.operation === 'clear'"
    :requested="clearRequested"
    @cancel="cancelClear"
    @confirm="confirmClear"
  />
</template>
