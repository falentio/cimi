<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import type { RetentionPolicy, RetentionPolicyCardFooter } from './retention-policy.types'
import { retentionPolicyRows } from './retention-policy.utils'

const props = defineProps<{
  heading: string
  caption: string
  policy: RetentionPolicy
  provenance?: string
  footer?: RetentionPolicyCardFooter
}>()

const rows = computed(() => retentionPolicyRows(props.policy))
</script>

<template>
  <div class="min-w-0 rounded-lg border p-4">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="font-medium">{{ heading }}</h3>
      <Badge v-if="provenance" variant="secondary">{{ provenance }}</Badge>
    </div>
    <p class="text-muted-foreground mt-1 text-sm">{{ caption }}</p>
    <dl class="mt-4 grid gap-3 text-sm">
      <div v-for="row in rows" :key="row.label" class="flex flex-wrap justify-between gap-2">
        <dt class="text-muted-foreground">{{ row.label }}</dt>
        <dd class="text-end font-medium tabular-nums">{{ row.value }}</dd>
      </div>
      <div v-if="footer" class="flex flex-wrap justify-between gap-2 border-t pt-3">
        <dt class="text-muted-foreground">{{ footer.label }}</dt>
        <dd class="text-end font-medium">
          <time :datetime="footer.datetime">{{ footer.value }}</time>
        </dd>
      </div>
    </dl>
  </div>
</template>
