<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { overviewFilterDefinitions } from './site-overview-filters'
import type { OverviewFilterOperatorOption } from './site-overview-filters'
import type { OverviewFilterOperator } from './site-overview.types'

const props = defineProps<{
  readonly canApply: boolean
  readonly operators: readonly OverviewFilterOperatorOption[]
}>()

const definitionKey = defineModel<string>('definitionKey', { required: true })
const operator = defineModel<OverviewFilterOperator>('operator', { required: true })
const value = defineModel<string>('value', { required: true })

const emit = defineEmits<{
  apply: []
  cancel: []
}>()
</script>

<template>
  <PopoverContent
    align="start"
    aria-labelledby="overview-filter-editor-title"
    aria-describedby="overview-filter-editor-description"
  >
    <PopoverHeader>
      <PopoverTitle id="overview-filter-editor-title">Filter overview</PopoverTitle>
      <PopoverDescription id="overview-filter-editor-description">
        Choose an operation and value for the current overview.
      </PopoverDescription>
    </PopoverHeader>

    <form class="flex flex-col gap-3" @submit.prevent="emit('apply')">
      <div class="flex flex-col gap-1.5">
        <Label for="overview-filter-dimension">Dimension</Label>
        <Select v-model="definitionKey">
          <SelectTrigger id="overview-filter-dimension" class="w-full">
            <SelectValue placeholder="Choose a dimension" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="definition in overviewFilterDefinitions"
              :key="`${definition.scope}.${definition.field}`"
              :value="`${definition.scope}.${definition.field}`"
            >
              {{ definition.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex flex-col gap-1.5">
        <Label for="overview-filter-operator">Operation</Label>
        <Select v-model="operator">
          <SelectTrigger id="overview-filter-operator" class="w-full">
            <SelectValue placeholder="Choose an operation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in props.operators" :key="option.value" :value="option.value">
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex flex-col gap-1.5">
        <Label for="overview-filter-value">Value</Label>
        <Input
          id="overview-filter-value"
          v-model="value"
          name="overview-filter-value"
          placeholder="Enter a value"
          type="text"
          autocomplete="off"
        />
      </div>

      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" @click="emit('cancel')">Cancel</Button>
        <Button type="submit" :disabled="!canApply">Apply</Button>
      </div>
    </form>
  </PopoverContent>
</template>
