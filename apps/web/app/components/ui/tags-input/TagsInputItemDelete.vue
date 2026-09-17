<script setup lang="ts">
import type { TagsInputItemDeleteProps } from 'reka-ui'

import type { HTMLAttributes } from 'vue'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { reactiveOmit } from '@vueuse/core'
import { TagsInputItemDelete, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<TagsInputItemDeleteProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <TagsInputItemDelete
    v-bind="forwardedProps"
    :class="cn('flex rounded bg-transparent mr-1', props.class)"
  >
    <slot>
      <HugeiconsIcon :icon="Cancel01Icon" class="w-4 h-4" />
    </slot>
  </TagsInputItemDelete>
</template>
