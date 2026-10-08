<script setup lang="ts">
import { computed, type Component } from 'vue'
import CollectionPolicySummary from '../CollectionPolicySummary.vue'
import type { CollectionPolicyEditorView } from '../collection-policy.types'
import { isStringValue } from '../../../../utils/type-guards'
import EffectiveBrief from './EffectiveBrief.vue'
import EffectiveBriefs from './EffectiveBriefs.vue'
import EffectiveDiff from './EffectiveDiff.vue'
import EffectiveDiffV2 from './EffectiveDiffV2.vue'
import EffectiveLedger from './EffectiveLedger.vue'
import EffectiveMatrix from './EffectiveMatrix.vue'
import VariantPicker from './VariantPicker.vue'

const props = defineProps<{ editor: CollectionPolicyEditorView }>()

type EffectiveVariant = {
  readonly id: string
  readonly label: string
  readonly component: Component
}

const VARIANTS = [
  { id: 'current', label: 'Current', component: CollectionPolicySummary },
  { id: 'brief', label: 'Brief', component: EffectiveBrief },
  { id: 'matrix', label: 'Matrix', component: EffectiveMatrix },
  { id: 'briefs', label: 'Briefs', component: EffectiveBriefs },
  { id: 'ledger', label: 'Ledger', component: EffectiveLedger },
  { id: 'diff', label: 'Diff', component: EffectiveDiff },
  { id: 'diff-2', label: 'Diff 2', component: EffectiveDiffV2 },
] as const satisfies ReadonlyArray<EffectiveVariant>

const pickerVariants = VARIANTS.map((variant) => ({ id: variant.id, label: variant.label }))

const route = useRoute()

const active = computed<EffectiveVariant>(() => {
  const raw = route.query.variant
  const id = Array.isArray(raw) ? raw[0] : raw

  if (!isStringValue(id)) return VARIANTS[0]

  return VARIANTS.find((variant) => variant.id === id) ?? VARIANTS[0]
})
</script>

<template>
  <div class="grid min-w-0 gap-4">
    <component :is="active.component" :editor="props.editor" />
    <VariantPicker :variants="pickerVariants" />
  </div>
</template>
