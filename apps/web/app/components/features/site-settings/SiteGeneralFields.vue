<script setup lang="ts">
import { WEEK_START_OPTIONS } from './site-settings.utils'
import type { SiteSettingsDraft } from './site-settings.types'

defineProps<{
  draft: SiteSettingsDraft
  nameError: string | null
  hostnameError: string | null
  timezoneError: string | null
  weekStartError: string | null
  timezoneOptions: readonly { readonly value: string; readonly label: string }[]
  disabled: boolean
}>()

const emit = defineEmits<{
  updateName: [value: string]
  updateHostname: [value: string]
  updateTimezone: [value: SiteSettingsDraft['reportingTimezone']]
  updateWeekStart: [value: SiteSettingsDraft['weekStartsOn']]
}>()

function updateName(value: unknown): void {
  if (typeof value === 'string' || typeof value === 'number') emit('updateName', String(value))
}

function updateHostname(value: unknown): void {
  if (typeof value === 'string' || typeof value === 'number') emit('updateHostname', String(value))
}

function updateTimezone(value: unknown): void {
  if (typeof value === 'string') emit('updateTimezone', value)
}

function isWeekStart(value: string): value is SiteSettingsDraft['weekStartsOn'] {
  return WEEK_START_OPTIONS.some((option) => option.value === value)
}

function updateWeekStart(value: unknown): void {
  if (typeof value === 'string' && isWeekStart(value)) emit('updateWeekStart', value)
}
</script>

<template>
  <UIFieldGroup>
    <UIField :data-invalid="nameError !== null">
      <UIFieldLabel for="site-settings-name">Site name</UIFieldLabel>
      <UIInput
        id="site-settings-name"
        :model-value="draft.name"
        autocomplete="organization"
        :aria-describedby="
          nameError
            ? 'site-settings-name-description site-settings-name-error'
            : 'site-settings-name-description'
        "
        :aria-invalid="nameError !== null"
        :disabled="disabled"
        maxlength="256"
        name="name"
        required
        @update:model-value="updateName"
      />
      <UIFieldDescription id="site-settings-name-description">
        Use a name your team will recognize.
      </UIFieldDescription>
      <UIFieldError v-if="nameError" id="site-settings-name-error">{{ nameError }}</UIFieldError>
    </UIField>

    <UIField :data-invalid="hostnameError !== null">
      <UIFieldLabel for="site-settings-hostname">Hostname</UIFieldLabel>
      <UIInput
        id="site-settings-hostname"
        :model-value="draft.hostname"
        autocapitalize="none"
        autocomplete="url"
        :aria-describedby="
          hostnameError
            ? 'site-settings-hostname-description site-settings-hostname-error'
            : 'site-settings-hostname-description'
        "
        :aria-invalid="hostnameError !== null"
        :disabled="disabled"
        inputmode="url"
        maxlength="253"
        name="hostname"
        placeholder="www.example.com"
        required
        spellcheck="false"
        @update:model-value="updateHostname"
      />
      <UIFieldDescription id="site-settings-hostname-description">
        Enter the hostname where this site is published.
      </UIFieldDescription>
      <UIFieldError v-if="hostnameError" id="site-settings-hostname-error">
        {{ hostnameError }}
      </UIFieldError>
    </UIField>

    <UIField :data-invalid="timezoneError !== null">
      <UIFieldLabel for="site-settings-timezone">Reporting timezone</UIFieldLabel>
      <UICombobox
        :model-value="draft.reportingTimezone"
        :disabled="disabled"
        name="reportingTimezone"
        @update:model-value="updateTimezone"
      >
        <UIComboboxAnchor as-child>
          <UIComboboxTrigger as-child>
            <UIButton
              id="site-settings-timezone"
              class="w-full justify-between"
              :aria-describedby="
                timezoneError
                  ? 'site-settings-timezone-description site-settings-timezone-error'
                  : 'site-settings-timezone-description'
              "
              :aria-invalid="timezoneError !== null"
              variant="outline"
            >
              {{ draft.reportingTimezone || 'Choose a timezone' }}
            </UIButton>
          </UIComboboxTrigger>
        </UIComboboxAnchor>
        <UIComboboxList align="start">
          <UIComboboxInput placeholder="Search a timezone" />
          <UIComboboxEmpty>No timezone found.</UIComboboxEmpty>
          <UIComboboxGroup>
            <UIComboboxItem
              v-for="option in timezoneOptions"
              :key="option.value"
              :value="option.value"
              :text-value="option.label"
            >
              {{ option.label }}
              <UIComboboxItemIndicator />
            </UIComboboxItem>
          </UIComboboxGroup>
        </UIComboboxList>
      </UICombobox>
      <UIFieldDescription id="site-settings-timezone-description">
        Analytics reports use this timezone when grouping dates.
      </UIFieldDescription>
      <UIFieldError v-if="timezoneError" id="site-settings-timezone-error">
        {{ timezoneError }}
      </UIFieldError>
    </UIField>

    <UIField :data-invalid="weekStartError !== null">
      <UIFieldLabel for="site-settings-week-start">Week starts on</UIFieldLabel>
      <UISelect
        :model-value="draft.weekStartsOn"
        :disabled="disabled"
        name="weekStartsOn"
        @update:model-value="updateWeekStart"
      >
        <UISelectTrigger id="site-settings-week-start" class="w-full">
          <UISelectValue placeholder="Choose a week start" />
        </UISelectTrigger>
        <UISelectContent>
          <UISelectItem
            v-for="option in WEEK_START_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </UISelectItem>
        </UISelectContent>
      </UISelect>
      <UIFieldDescription id="site-settings-week-start-description">
        This controls the first day shown in weekly reports.
      </UIFieldDescription>
      <UIFieldError v-if="weekStartError" id="site-settings-week-start-error">
        {{ weekStartError }}
      </UIFieldError>
    </UIField>
  </UIFieldGroup>
</template>
