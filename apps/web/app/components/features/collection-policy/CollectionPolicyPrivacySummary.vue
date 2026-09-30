<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CollectionPolicyEditorView } from './collection-policy.types'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const summary = computed(() => props.editor.summary)

const exclusionTotal = computed(() =>
  summary.value.exclusions.reduce((total, entry) => total + entry.count, 0),
)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle><h3>Privacy summary</h3></CardTitle>
      <CardDescription>
        Derived from the values currently in the editor, before anything is saved.
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4 text-sm">
      <dl class="grid gap-3">
        <div class="flex flex-wrap justify-between gap-2">
          <dt class="text-muted-foreground">Anonymous traffic</dt>
          <dd class="font-medium">{{ summary.anonymousStance }}</dd>
        </div>
        <div class="flex flex-wrap justify-between gap-2">
          <dt class="text-muted-foreground">Privacy signals</dt>
          <dd class="font-medium">{{ summary.signalRespect }}</dd>
        </div>
        <div class="flex flex-wrap justify-between gap-2">
          <dt class="text-muted-foreground">Consent</dt>
          <dd class="font-medium">{{ summary.consentStance }}</dd>
        </div>
        <div class="flex flex-wrap justify-between gap-2">
          <dt class="text-muted-foreground">Automated traffic</dt>
          <dd class="font-medium">{{ summary.botStance }}</dd>
        </div>
      </dl>

      <div>
        <h4 class="font-medium">URL capture</h4>
        <ul class="text-muted-foreground mt-1 list-inside list-disc">
          <li v-for="line in summary.urlCapture" :key="line">{{ line }}</li>
        </ul>
      </div>

      <div>
        <h4 class="font-medium">Property capture</h4>
        <ul class="text-muted-foreground mt-1 list-inside list-disc">
          <li v-for="line in summary.propertyCapture" :key="line">{{ line }}</li>
        </ul>
      </div>

      <div>
        <h4 class="font-medium">Exclusions</h4>
        <p v-if="exclusionTotal === 0" class="text-muted-foreground mt-1">
          Nothing is excluded. Every request that passes the rules above can create a record.
        </p>
        <ul v-else class="text-muted-foreground mt-1 list-inside list-disc">
          <li v-for="entry in summary.exclusions" :key="entry.label">
            {{ entry.label }}: {{ entry.count }}
          </li>
        </ul>
      </div>

      <div class="rounded-md border p-3">
        <h4 class="font-medium">What a refusal means</h4>
        <p class="text-muted-foreground mt-1">
          A refused request creates no accepted record, no Visitor, no Identified User, and no
          Session. The server evaluates this policy when the request arrives; nothing here changes
          what already-stored data contains.
        </p>
      </div>

      <div>
        <h4 class="font-medium">
          {{ editor.changes.length === 0 ? 'No pending changes' : 'Pending changes' }}
        </h4>
        <p v-if="editor.changes.length === 0" class="text-muted-foreground mt-1">
          The editor matches the current Site values.
        </p>
        <ul v-else class="mt-1 grid gap-1">
          <li v-for="change in editor.changes" :key="change.field">
            <span class="font-medium">{{ change.label }}.</span>
            <span class="text-muted-foreground"> {{ change.detail }}</span>
          </li>
        </ul>
      </div>
    </CardContent>
  </Card>
</template>
