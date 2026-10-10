<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDownRight01Icon, ArrowUpRight01Icon, MinusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ChangeKind, OverviewIcon, OverviewMetricView } from './site-overview.types'

const props = defineProps<{
  readonly metrics: readonly OverviewMetricView[]
}>()

const changeIcons: Readonly<Record<ChangeKind, OverviewIcon>> = {
  positive: ArrowUpRight01Icon,
  negative: ArrowDownRight01Icon,
  neutral: MinusSignIcon,
}

const changeClasses: Readonly<Record<ChangeKind, string>> = {
  positive: 'text-emerald-700 dark:text-emerald-300',
  negative: 'text-destructive',
  neutral: 'text-muted-foreground',
}

const cells = computed(() =>
  props.metrics.map((metric) => ({
    metric,
    icon: changeIcons[metric.changeKind],
    changeClass: changeClasses[metric.changeKind],
  })),
)
</script>

<template>
  <section aria-label="Key metrics" class="min-w-0">
    <Card class="min-w-0 gap-0 p-0">
      <CardContent class="bg-muted p-0">
        <ul class="grid min-w-0 list-none grid-cols-2 gap-1 bg-muted md:grid-cols-3 xl:grid-cols-6">
          <li v-for="{ metric, icon, changeClass } in cells" :key="metric.id" class="min-w-0">
            <div
              :class="
                cn(
                  'flex w-full min-w-0 flex-col overflow-hidden rounded-lg bg-card text-left',
                  'ring-1 ring-transparent ring-inset',
                )
              "
            >
              <div class="grid min-w-0 gap-3 px-4 pt-4 pb-4">
                <div class="flex min-w-0 items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-muted-foreground break-words text-sm font-medium">
                      {{ metric.label }}
                    </p>
                    <p class="text-2xl font-semibold tracking-tight tabular-nums">
                      {{ metric.value }}
                    </p>
                  </div>
                  <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <HugeiconsIcon :icon="metric.icon" :size="16" aria-hidden="true" />
                  </span>
                </div>
                <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span
                    v-if="metric.change !== null"
                    :class="['inline-flex items-center gap-1 font-medium', changeClass]"
                  >
                    <HugeiconsIcon :icon="icon" :size="14" aria-hidden="true" />
                    {{ metric.change }}
                  </span>
                  <span class="text-muted-foreground">{{ metric.comparison }}</span>
                </div>
                <p v-if="metric.denominatorLabel !== null" class="text-muted-foreground text-xs">
                  of {{ metric.denominatorLabel }}
                </p>
                <span class="sr-only">
                  {{ metric.label }} is {{ metric.value
                  }}{{
                    metric.change === null
                      ? ''
                      : ', changed ' + metric.change + ' ' + metric.comparison
                  }}
                  {{
                    metric.denominatorLabel === null
                      ? ''
                      : ', measured against ' + metric.denominatorLabel
                  }}
                </span>
              </div>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  </section>
</template>
