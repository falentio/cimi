<script setup lang="ts">
import { computed } from 'vue'
import { formatRetentionDate } from './retention-policy.utils'
import type { RetentionPolicyEditorView } from './retention-policy.types'

const props = defineProps<{
  effective: RetentionPolicyEditorView['effective']
  updatedAt: RetentionPolicyEditorView['updatedAt']
}>()

const replayLabel = computed(() =>
  props.effective.replayMonths === null ? 'Disabled' : `${props.effective.replayMonths} months`,
)

type SummaryRow = {
  label: string
  value: string
  datetime?: string
  divided?: boolean
}

const rows = computed<SummaryRow[]>(() => [
  { label: 'Events', value: `${props.effective.eventMonths} months` },
  { label: 'Profiles', value: `${props.effective.profileMonths} months` },
  { label: 'Replay', value: replayLabel.value },
  {
    label: 'Updated',
    value: formatRetentionDate(props.updatedAt),
    datetime: props.updatedAt,
    divided: true,
  },
])
</script>

<template>
  <div class="min-w-0 rounded-lg border p-4">
    <h3 class="font-medium">Effective policy</h3>
    <p class="text-muted-foreground mt-1 text-sm">
      This is the policy currently resolved for installation scope.
    </p>
    <dl class="mt-4 grid gap-3 text-sm">
      <div
        v-for="row in rows"
        :key="row.label"
        class="flex flex-wrap justify-between gap-2"
        :class="row.divided ? 'border-t pt-3' : undefined"
      >
        <dt class="text-muted-foreground">{{ row.label }}</dt>
        <dd class="text-end font-medium">
          <time v-if="row.datetime" :datetime="row.datetime">{{ row.value }}</time>
          <template v-else>{{ row.value }}</template>
        </dd>
      </div>
    </dl>
  </div>
</template>
