<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { InputGroupVariants } from '.'
import { cn } from '@/lib/utils'
import { inputGroupAddonVariants } from '.'

const props = withDefaults(
  defineProps<{
    align?: InputGroupVariants['align']
    class?: HTMLAttributes['class']
  }>(),
  {
    align: 'inline-start',
  },
)

function handleInputGroupAddonClick(e: MouseEvent) {
  if (!(e.currentTarget instanceof HTMLElement) || !(e.target instanceof HTMLElement)) return
  const currentTarget = e.currentTarget
  const target = e.target

  if (target && target.closest('button')) {
    return
  }

  if (currentTarget && currentTarget?.parentElement) {
    currentTarget.parentElement?.querySelector('input')?.focus()
  }
}
</script>

<template>
  <div
    role="group"
    data-slot="input-group-addon"
    :data-align="props.align"
    :class="cn(inputGroupAddonVariants({ align: props.align }), props.class)"
    @click="handleInputGroupAddonClick"
  >
    <slot />
  </div>
</template>
