<script lang="ts" setup>
import type { HTMLAttributes } from 'vue'

import { MoreHorizontalCircle01Icon } from '@hugeicons/vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <span
    data-slot="breadcrumb-ellipsis"
    role="presentation"
    aria-hidden="true"
    :class="cn('size-5 [&>svg]:size-4 flex items-center justify-center', props.class)"
  >
    <slot>
      <MoreHorizontalCircle01Icon />
    </slot>
    <span class="sr-only">More</span>
  </span>
</template>
