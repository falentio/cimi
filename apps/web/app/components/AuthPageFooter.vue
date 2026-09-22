<script setup lang="ts">
import { Button } from '@/components/ui/button'
import type { SupportedLocale } from '@/composables/useLocalizedValibotSchema'

const { locale, setLocale, t } = useI18n()

const localeOptions = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
] satisfies readonly { code: SupportedLocale; label: string }[]

async function switchLocale(nextLocale: SupportedLocale): Promise<void> {
  if (locale.value === nextLocale) return
  await setLocale(nextLocale)
}
</script>

<template>
  <footer class="flex w-full justify-center">
    <div class="flex justify-center" role="group" :aria-label="t('auth.languageLabel')">
      <Button
        v-for="localeOption in localeOptions"
        :key="localeOption.code"
        class="min-w-10"
        size="sm"
        type="button"
        variant="ghost"
        :aria-pressed="locale === localeOption.code"
        @click="switchLocale(localeOption.code)"
      >
        {{ localeOption.label }}
      </Button>
    </div>
  </footer>
</template>
