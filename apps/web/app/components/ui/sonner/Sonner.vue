<script lang="ts" setup>
import type { ToasterProps } from 'vue-sonner'

import {
  CheckmarkCircle01Icon,
  InformationCircleIcon,
  Loading03Icon,
  CancelCircleIcon,
  Alert02Icon,
  Cancel01Icon,
} from '@hugeicons/vue'
import { reactiveOmit } from '@vueuse/core'
import { Toaster as Sonner } from 'vue-sonner'
import { cn } from '@/lib/utils'

const props = defineProps<ToasterProps>()
const delegatedProps = reactiveOmit(props, 'class', 'toastOptions')
</script>

<template>
  <Sonner
    :class="cn('toaster group', props.class)"
    :style="{
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
      '--border-radius': 'var(--radius)',
      '--gray2': 'hsl(var(--popover) / 0.9)',
      '--gray3': 'var(--border)',
      '--gray4': 'var(--border)',
      '--gray5': 'var(--border)',
      '--gray12': 'var(--popover-foreground)',
    }"
    :toast-options="
      props.toastOptions ?? {
        classes: {
          toast: 'rounded-2xl',
        },
      }
    "
    v-bind="delegatedProps"
  >
    <template #success-icon>
      <CheckmarkCircle01Icon class="size-4" />
    </template>
    <template #info-icon>
      <InformationCircleIcon class="size-4" />
    </template>
    <template #warning-icon>
      <Alert02Icon class="size-4" />
    </template>
    <template #error-icon>
      <CancelCircleIcon class="size-4" />
    </template>
    <template #loading-icon>
      <div>
        <Loading03Icon class="size-4 animate-spin" />
      </div>
    </template>
    <template #close-icon>
      <Cancel01Icon class="size-4" />
    </template>
  </Sonner>
</template>
