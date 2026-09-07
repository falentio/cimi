<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { MinusSignIcon } from '@hugeicons/vue'
import { reactiveOmit } from '@vueuse/core'
import { useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <div
    data-slot="input-otp-separator"
    role="separator"
    v-bind="forwarded"
    :class="cn('[&_svg:not([class*=size-])]:size-4 flex items-center', props.class)"
  >
    <slot>
      <MinusSignIcon />
    </slot>
  </div>
</template>
