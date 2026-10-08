<script setup lang="ts">
import { computed } from 'vue'
import type { CollectionPolicyEditorView, PolicyProvenance } from './collection-policy.types'
import { effectiveCollectionPolicyGroups } from './collection-policy.utils'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

const groups = computed(() =>
  effectiveCollectionPolicyGroups({
    effective: props.editor.effective,
    source: props.editor.source,
  }),
)

const siteCount = computed(
  () => groups.value.flatMap((group) => group.rows).filter((row) => row.source === 'site').length,
)

const totalCount = computed(() => groups.value.flatMap((group) => group.rows).length)

function sourceLabel(source: PolicyProvenance): string {
  return source === 'site' ? 'Site' : 'Inherited'
}
</script>

<template>
  <div class="min-w-0 rounded-lg border p-4">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h4 class="font-medium">Effective collection policy</h4>
      <p class="text-muted-foreground text-sm">
        {{ siteCount }} of {{ totalCount }} fields set here
      </p>
    </div>
    <p class="text-muted-foreground mt-1 text-sm">
      This is what the server resolves for this Site right now.
      <template v-if="editor.hasOverride">
        The Site override replaces the whole Site layer, so every field below belongs to it.
      </template>
      <template v-else>
        No Site override is stored, so every field comes from the installation default.
      </template>
    </p>

    <div v-for="group in groups" :key="group.id" class="mt-4 min-w-0">
      <h5 class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {{ group.title }}
      </h5>
      <ul class="mt-2 grid gap-2">
        <li
          v-for="row in group.rows"
          :key="row.field"
          class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"
          :class="row.source === 'site' ? 'text-foreground' : 'text-muted-foreground'"
        >
          <span class="min-w-0 font-medium">{{ row.label }}</span>
          <span class="min-w-0 text-end break-words">
            {{ row.value
            }}<span class="text-muted-foreground"> · {{ sourceLabel(row.source) }}</span>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
