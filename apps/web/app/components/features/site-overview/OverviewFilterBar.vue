<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { FilterRemoveIcon, PencilEdit02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import OverviewFilterEditor from './OverviewFilterEditor.vue'
import { overviewFilterDefinitions } from './site-overview-filters'
import type { OverviewFilterDefinition } from './site-overview-filters'
import type { OverviewFilter, OverviewFilterOperator } from './site-overview.types'

const props = defineProps<{
  readonly filters: readonly OverviewFilter[]
}>()

const emit = defineEmits<{
  addFilter: [filter: OverviewFilter]
  replaceFilter: [payload: { current: OverviewFilter; replacement: OverviewFilter }]
  removeFilter: [filter: OverviewFilter]
  clearFilters: []
}>()

const isOpen = shallowRef(false)
const draftDefinitionKey = shallowRef('')
const draftOperator = shallowRef<OverviewFilterOperator>('equals')
const draftValue = shallowRef('')
const editingFilter = shallowRef<OverviewFilter | null>(null)

const selectedDefinition = computed(() =>
  overviewFilterDefinitions.find(
    (definition) => definitionKey(definition) === draftDefinitionKey.value,
  ),
)
const canApply = computed(
  () => selectedDefinition.value !== undefined && draftValue.value.trim().length > 0,
)

function definitionKey(definition: OverviewFilterDefinition | OverviewFilter): string {
  return `${definition.scope}.${definition.field}`
}

function filterForValue(filter: OverviewFilter, value: string): OverviewFilter {
  return { ...filter, values: [value] }
}

function filterLabel(filter: OverviewFilter): string {
  return (
    overviewFilterDefinitions.find(
      (definition) => definition.scope === filter.scope && definition.field === filter.field,
    )?.label ?? `${filter.scope}.${filter.field}`
  )
}

function filterOperatorLabel(filter: OverviewFilter): string {
  return (
    overviewFilterDefinitions
      .find((definition) => definition.scope === filter.scope && definition.field === filter.field)
      ?.operators.find((operator) => operator.value === filter.operator)?.label ?? filter.operator
  )
}

function prepareAddEditor(): void {
  const firstDefinition = overviewFilterDefinitions.at(0)
  if (firstDefinition === undefined) return

  editingFilter.value = null
  draftDefinitionKey.value = definitionKey(firstDefinition)
  draftOperator.value = 'equals'
  draftValue.value = ''
}

function openEditEditor(filter: OverviewFilter): void {
  editingFilter.value = filter
  draftDefinitionKey.value = definitionKey(filter)
  draftOperator.value = filter.operator
  draftValue.value = filter.values[0]
  isOpen.value = true
}

function draftFilter(): OverviewFilter | null {
  const definition = selectedDefinition.value
  const value = draftValue.value.trim()
  if (definition === undefined || value.length === 0) return null

  if (definition.scope === 'event') {
    return {
      scope: 'event',
      field: definition.field,
      operator: draftOperator.value,
      values: [value],
    }
  }

  return {
    scope: 'session',
    field: definition.field,
    operator: draftOperator.value,
    values: [value],
  }
}

function applyEditor(): void {
  const filter = draftFilter()
  if (filter === null) return

  if (editingFilter.value === null) {
    emit('addFilter', filter)
  } else {
    emit('replaceFilter', { current: editingFilter.value, replacement: filter })
  }

  isOpen.value = false
}

function cancelEditor(): void {
  isOpen.value = false
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <div role="group" aria-label="Overview filters" class="flex flex-wrap items-center gap-2">
      <span class="text-muted-foreground text-xs font-medium">Filters</span>

      <div v-if="props.filters.length > 0" class="flex flex-wrap items-center gap-1.5">
        <div
          v-for="filter in props.filters"
          :key="`${filter.scope}.${filter.field}.${filter.operator}`"
          class="flex flex-wrap items-center gap-1.5"
        >
          <div
            v-for="value in filter.values"
            :key="`${filter.scope}.${filter.field}.${filter.operator}.${value}`"
            class="bg-muted text-foreground inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
          >
            <span class="max-w-52 truncate">
              {{ filterLabel(filter) }} {{ filterOperatorLabel(filter) }} {{ value }}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              :aria-label="`Edit ${filterLabel(filter)} ${filterOperatorLabel(filter)} ${value}`"
              @click="openEditEditor(filterForValue(filter, value))"
            >
              <HugeiconsIcon :icon="PencilEdit02Icon" aria-hidden="true" data-icon="inline-start" />
              <span class="sr-only">Edit</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              :aria-label="`Remove ${filterLabel(filter)} ${filterOperatorLabel(filter)} ${value}`"
              @click="emit('removeFilter', filterForValue(filter, value))"
            >
              <HugeiconsIcon :icon="FilterRemoveIcon" aria-hidden="true" data-icon="inline-start" />
              <span class="sr-only">Remove</span>
            </Button>
          </div>
        </div>
      </div>
      <span v-else class="text-muted-foreground text-xs">No filters applied</span>

      <div class="flex items-center gap-1.5">
        <Button
          v-if="props.filters.length > 0"
          type="button"
          variant="ghost"
          size="sm"
          @click="emit('clearFilters')"
        >
          Clear all
        </Button>
        <PopoverTrigger as-child>
          <Button type="button" variant="outline" size="sm" @click="prepareAddEditor">
            <HugeiconsIcon :icon="PlusSignIcon" aria-hidden="true" data-icon="inline-start" />
            Add filter
          </Button>
        </PopoverTrigger>
      </div>
    </div>

    <OverviewFilterEditor
      v-model:definition-key="draftDefinitionKey"
      v-model:operator="draftOperator"
      v-model:value="draftValue"
      :can-apply="canApply"
      :operators="selectedDefinition?.operators ?? []"
      @apply="applyEditor"
      @cancel="cancelEditor"
    />
  </Popover>
</template>
