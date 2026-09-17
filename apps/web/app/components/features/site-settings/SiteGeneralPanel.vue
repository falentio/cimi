<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FieldError } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import {
  getSiteSettingsFieldError,
  getTimezoneOptions,
  normalizeSiteSettingsDraft,
} from './site-settings.utils'
import type { Site, SiteSaveState, SiteSettingsDraft } from './site-settings.types'
import SiteGeneralFields from './SiteGeneralFields.vue'

const props = defineProps<{
  site: Site
  saveState: SiteSaveState
}>()

const emit = defineEmits<{
  save: [draft: SiteSettingsDraft]
}>()

const name = shallowRef('')
const hostname = shallowRef('')
const reportingTimezone = shallowRef<SiteSettingsDraft['reportingTimezone']>('UTC')
const weekStartsOn = shallowRef<SiteSettingsDraft['weekStartsOn']>('monday')
const hasSubmitted = shallowRef(false)

const draft = computed<SiteSettingsDraft>(() => ({
  name: name.value,
  hostname: hostname.value,
  reportingTimezone: reportingTimezone.value,
  weekStartsOn: weekStartsOn.value,
}))
const timezoneOptions = computed(() => getTimezoneOptions(props.site.reportingTimezone))
const isSaving = computed(() => props.saveState.status === 'saving')
const nameError = computed(() => getSiteSettingsFieldError('name', draft.value, hasSubmitted.value))
const hostnameError = computed(() =>
  getSiteSettingsFieldError('hostname', draft.value, hasSubmitted.value),
)
const timezoneError = computed(() =>
  getSiteSettingsFieldError('reportingTimezone', draft.value, hasSubmitted.value),
)
const weekStartError = computed(() =>
  getSiteSettingsFieldError('weekStartsOn', draft.value, hasSubmitted.value),
)

watch(
  () => [
    props.site.id,
    props.site.name,
    props.site.hostname,
    props.site.reportingTimezone,
    props.site.weekStartsOn,
  ],
  () => {
    name.value = props.site.name
    hostname.value = props.site.hostname
    reportingTimezone.value = props.site.reportingTimezone
    weekStartsOn.value = props.site.weekStartsOn
    hasSubmitted.value = false
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  hasSubmitted.value = true
  const normalizedDraft = normalizeSiteSettingsDraft(draft.value)
  const hasError = [
    nameError.value,
    hostnameError.value,
    timezoneError.value,
    weekStartError.value,
  ].some((error) => error !== null)
  if (hasError) {
    await nextTick()
    document
      .getElementById(
        nameError.value !== null
          ? 'site-settings-name'
          : hostnameError.value !== null
            ? 'site-settings-hostname'
            : timezoneError.value !== null
              ? 'site-settings-timezone'
              : 'site-settings-week-start',
      )
      ?.focus()
    return
  }

  emit('save', normalizedDraft)
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle><h2>General</h2></CardTitle>
      <CardDescription
        >Update the details used to identify and report on this site.</CardDescription
      >
    </CardHeader>
    <CardContent>
      <form
        class="flex max-w-xl flex-col gap-6"
        novalidate
        :aria-busy="isSaving"
        @submit.prevent="submit"
      >
        <SiteGeneralFields
          :disabled="isSaving"
          :draft="draft"
          :hostname-error="hostnameError"
          :name-error="nameError"
          :timezone-error="timezoneError"
          :timezone-options="timezoneOptions"
          :week-start-error="weekStartError"
          @update-hostname="hostname = $event"
          @update-name="name = $event"
          @update-timezone="reportingTimezone = $event"
          @update-week-start="weekStartsOn = $event"
        />

        <FieldError v-if="saveState.status === 'error'" role="alert">
          {{ saveState.error.message }}
        </FieldError>
        <Button class="self-start" :disabled="isSaving" type="submit">
          <Spinner v-if="isSaving" aria-hidden="true" />
          {{ isSaving ? 'Saving…' : 'Save changes' }}
        </Button>
      </form>
    </CardContent>
    <CardFooter class="flex-col items-start gap-1">
      <p v-if="saveState.status === 'saved'" class="text-sm text-emerald-600" role="status">
        Changes saved.
      </p>
      <p
        v-if="saveState.status === 'saved' && saveState.warning"
        class="text-muted-foreground text-sm"
        role="status"
      >
        {{ saveState.warning.message }}
      </p>
      <p v-else class="text-muted-foreground text-sm">
        Changes apply to everyone who can access this site.
      </p>
    </CardFooter>
  </Card>
</template>
