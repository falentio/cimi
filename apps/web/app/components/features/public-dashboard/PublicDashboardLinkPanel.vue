<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import { Copy01Icon, Share08Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { publicDashboardUrl } from './public-dashboard.utils'

const props = defineProps<{ identifier: string }>()

const requestUrl = useRequestURL()

const url = computed(() => publicDashboardUrl(requestUrl.origin, props.identifier))

const copyStatus = shallowRef<string | null>(null)

const input = useTemplateRef<HTMLInputElement>('link')

function selectUrl(): void {
  input.value?.select()
}

const canShare = computed(() => typeof navigator !== 'undefined' && navigator.share !== undefined)

async function copyUrl(): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
    copyStatus.value = 'Copy is unavailable in this browser. Select the link and copy it manually.'

    return
  }

  try {
    await navigator.clipboard.writeText(url.value)
    copyStatus.value = 'Public link copied.'
  } catch {
    copyStatus.value = 'Copy failed. Select the link and copy it manually.'
  }
}

async function shareUrl(): Promise<void> {
  try {
    await navigator.share({ title: 'Public dashboard', url: url.value })
    copyStatus.value = 'Public link shared.'
  } catch {
    copyStatus.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <label class="text-sm font-medium" for="public-dashboard-url">Public link</label>
    <UIInputGroup>
      <UIInputGroupInput
        id="public-dashboard-url"
        ref="link"
        readonly
        spellcheck="false"
        :model-value="url"
        @focus="selectUrl"
      />
      <UIInputGroupAddon align="inline-end">
        <UIInputGroupButton aria-label="Copy public link" title="Copy public link" @click="copyUrl">
          <HugeiconsIcon :icon="Copy01Icon" aria-hidden="true" />
        </UIInputGroupButton>
      </UIInputGroupAddon>
    </UIInputGroup>
    <div class="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" @click="copyUrl">
        <HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" aria-hidden="true" />
        Copy link
      </Button>
      <Button v-if="canShare" type="button" variant="outline" size="sm" @click="shareUrl">
        <HugeiconsIcon :icon="Share08Icon" data-icon="inline-start" aria-hidden="true" />
        Share link
      </Button>
      <p v-if="copyStatus" class="text-muted-foreground text-sm" role="status">{{ copyStatus }}</p>
    </div>
    <p class="text-muted-foreground text-xs">
      Anyone with this link can read the aggregate view. The link is a shareable capability, not a
      secret. Rotating the identifier revokes this link.
    </p>
  </div>
</template>
