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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { normalizeOrganizationNameDraft } from './organization-settings.utils'
import type {
  Organization,
  OrganizationNameInput,
  SettingsError,
} from './organization-settings.types'

const props = defineProps<{
  organization: Organization
  isSaving: boolean
  error: SettingsError | undefined
}>()

const emit = defineEmits<{
  save: [input: OrganizationNameInput]
}>()

const organizationName = shallowRef('')
const hasSubmitted = shallowRef(false)

watch(
  () => props.organization.name,
  (name) => {
    organizationName.value = name
  },
  { immediate: true },
)

const nameError = computed(() => {
  if (!hasSubmitted.value || normalizeOrganizationNameDraft(organizationName.value) !== null) {
    return null
  }
  return 'Enter an organization name.'
})

async function submit(): Promise<void> {
  hasSubmitted.value = true
  const name = normalizeOrganizationNameDraft(organizationName.value)
  if (name === null) {
    await nextTick()
    document.getElementById('organization-settings-name')?.focus()
    return
  }

  emit('save', { name })
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle><h2>General</h2></CardTitle>
      <CardDescription>
        Update the name shown in your workspace switcher and organization settings.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form
        class="flex max-w-xl flex-col gap-6"
        novalidate
        :aria-busy="isSaving"
        @submit.prevent="submit"
      >
        <Field :data-invalid="nameError !== null">
          <FieldLabel for="organization-settings-name">Organization name</FieldLabel>
          <Input
            id="organization-settings-name"
            v-model="organizationName"
            autocomplete="organization"
            :aria-describedby="
              nameError
                ? 'organization-settings-name-description organization-settings-name-error'
                : 'organization-settings-name-description'
            "
            :aria-invalid="nameError !== null"
            :disabled="isSaving"
            maxlength="256"
            name="organizationName"
            required
            type="text"
          />
          <FieldDescription id="organization-settings-name-description">
            Use a name your team will recognize in the workspace switcher.
          </FieldDescription>
          <FieldError v-if="nameError" id="organization-settings-name-error">
            {{ nameError }}
          </FieldError>
        </Field>
        <FieldError v-if="error" role="alert">{{ error.message }}</FieldError>
        <Button class="self-start" :disabled="isSaving" type="submit">
          <Spinner v-if="isSaving" aria-hidden="true" />
          {{ isSaving ? 'Saving…' : 'Save changes' }}
        </Button>
      </form>
    </CardContent>
    <CardFooter>
      <p class="text-muted-foreground text-sm">Changes apply to everyone in this organization.</p>
    </CardFooter>
  </Card>
</template>
