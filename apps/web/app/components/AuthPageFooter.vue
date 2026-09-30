<script setup lang="ts">
import type { AcceptableValue } from 'reka-ui'
import { computed } from 'vue'
import { ArrowDown01Icon, Globe02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Button } from '@/components/ui/button'
import type { SupportedLocale } from '@/composables/useLocalizedValibotSchema'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const { locale, setLocale } = useI18n()

const localeOptions = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
] satisfies readonly { code: SupportedLocale; name: string }[]

const currentLocaleName = computed(
  () =>
    localeOptions.find((localeOption) => localeOption.code === locale.value)?.name ?? locale.value,
)

async function switchLocale(nextLocale: SupportedLocale): Promise<void> {
  if (locale.value === nextLocale) return
  await setLocale(nextLocale)
}

function selectLocale(value: AcceptableValue): void {
  void switchLocale(value as SupportedLocale)
}
</script>

<template>
  <footer class="flex w-full justify-center">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="outline">
          <HugeiconsIcon :icon="Globe02Icon" aria-hidden="true" />
          {{ currentLocaleName }}
          <HugeiconsIcon :icon="ArrowDown01Icon" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuRadioGroup :model-value="locale" @update:model-value="selectLocale">
          <DropdownMenuRadioItem
            v-for="localeOption in localeOptions"
            :key="localeOption.code"
            :value="localeOption.code"
          >
            {{ localeOption.name }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </footer>
</template>
