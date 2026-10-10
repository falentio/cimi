<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  cohortFilterDimensionKey,
  cohortFilterDimensions,
  cohortFilterDraftToFilter,
  describeCohortFilter,
  cohortFilterOperatorOptions,
  isCohortValueOperator,
  normalizeCohortFilters,
  type CohortFilterDraft,
} from './cohort-filters'
import { isStringValue } from '../../../utils/type-guards'
import type { AcceptableValue } from 'reka-ui'
import type { CohortReportFilter } from './cohort-retention.types'

const filters = defineModel<readonly CohortReportFilter[]>({ required: true })

const open = ref(false)

const draft = ref<CohortFilterDraft>({
  scope: 'event',
  field: 'kind',
  operator: 'equals',
  values: [],
})

const canApply = computed(() => draft.value.field.trim() !== '' && draft.value.values.length > 0)

const scope = computed<CohortFilterDraft['scope']>({
  get: () => draft.value.scope,
  set: (value) => {
    draft.value = {
      ...draft.value,
      scope: value,
      field: value === 'profile' ? '' : fieldForScope(value),
    }
  },
})

const field = computed<string>({
  get: () => draft.value.field,
  set: (value) => {
    draft.value = { ...draft.value, field: value }
  },
})

const operator = computed<CohortFilterDraft['operator']>({
  get: () => draft.value.operator,
  set: (value) => {
    draft.value = { ...draft.value, operator: value }
  },
})

const dimensions = computed(() =>
  cohortFilterDimensions.filter((dimension) => dimension.scope === draft.value.scope),
)

function fieldForScope(scope: 'event' | 'session'): string {
  return cohortFilterDimensions.find((dimension) => dimension.scope === scope)?.field ?? ''
}

function onValuesChange(value: string | number): void {
  if (!isStringValue(value)) return

  const values = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')

  draft.value = { ...draft.value, values }
}

function apply(): void {
  const filter = cohortFilterDraftToFilter(draft.value)

  if (filter !== null) {
    filters.value = normalizeCohortFilters([...filters.value, filter])
  }

  open.value = false
  draft.value = { scope: 'event', field: 'kind', operator: 'equals', values: [] }
}

function remove(target: CohortReportFilter): void {
  const key = cohortFilterDimensionKey(target)

  filters.value = filters.value.filter((filter) => cohortFilterDimensionKey(filter) !== key)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <UIButton variant="outline" size="sm">Add filter</UIButton>
      </PopoverTrigger>
      <PopoverContent class="flex w-72 flex-col gap-3">
        <div class="flex flex-col gap-1">
          <Label for="filter-scope">Scope</Label>
          <NativeSelect id="filter-scope" v-model="scope">
            <option value="event">Event</option>
            <option value="session">Session</option>
            <option value="profile">Profile trait</option>
          </NativeSelect>
        </div>

        <div class="flex flex-col gap-1">
          <Label for="filter-field">Field</Label>
          <NativeSelect v-if="dimensions.length > 0" id="filter-field" v-model="field">
            <option v-for="dimension in dimensions" :key="dimension.field" :value="dimension.field">
              {{ dimension.label }}
            </option>
          </NativeSelect>
          <Input v-else id="filter-field" v-model="field" placeholder="trait.plan" />
        </div>

        <div class="flex flex-col gap-1">
          <Label for="filter-operator">Operator</Label>
          <NativeSelect id="filter-operator" v-model="operator">
            <option
              v-for="option in cohortFilterOperatorOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </NativeSelect>
        </div>

        <div class="flex flex-col gap-1">
          <Label for="filter-values">Value</Label>
          <Input
            id="filter-values"
            :model-value="draft.values.join(', ')"
            placeholder="checkout_completed"
            @update:model-value="onValuesChange"
          />
        </div>

        <div class="flex justify-end">
          <UIButton size="sm" :disabled="!canApply" @click="apply">Apply</UIButton>
        </div>
      </PopoverContent>
    </Popover>

    <ul v-if="filters.length > 0" class="flex flex-wrap gap-2">
      <li
        v-for="filter in filters"
        :key="cohortFilterDimensionKey(filter)"
        class="bg-secondary text-secondary-foreground flex items-center gap-2 rounded-md px-2 py-1 text-xs"
      >
        <span>{{ describeCohortFilter(filter) }}</span>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground"
          :aria-label="'Remove ' + describeCohortFilter(filter)"
          @click="remove(filter)"
        >
          ×
        </button>
      </li>
    </ul>
  </div>
</template>
