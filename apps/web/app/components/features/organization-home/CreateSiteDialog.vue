<script setup lang="ts">
import { computed, nextTick, shallowRef, toRef, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { WorkspaceTeam } from '@/components/features/app-shell/workspace'
import type { OrganizationId } from '@/components/features/organization-settings/organization-settings.types'
import {
  useOrganizationSiteCreation,
  type OrganizationSiteCreationResult,
} from './useOrganizationSiteCreation'
import { getOrganizationSiteDraftError } from './organization-home.utils'

const SITE_NAME_MAX_LENGTH = 256
const HOSTNAME_MAX_LENGTH = 253
const props = defineProps<{
  organizationId: OrganizationId
  organizationName: WorkspaceTeam['name']
}>()

const isOpen = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  created: [site: OrganizationSiteCreationResult]
}>()

const nameDraft = shallowRef('')
const hostnameDraft = shallowRef('')
const hasSubmitted = shallowRef(false)
const feedback = shallowRef<string | null>(null)
const { isCreating, error, createSite } = useOrganizationSiteCreation({
  organizationId: toRef(props, 'organizationId'),
})

const nameError = computed(() =>
  getOrganizationSiteDraftError(
    nameDraft.value,
    hasSubmitted.value,
    'site name',
    SITE_NAME_MAX_LENGTH,
  ),
)
const hostnameError = computed(() =>
  getOrganizationSiteDraftError(
    hostnameDraft.value,
    hasSubmitted.value,
    'hostname',
    HOSTNAME_MAX_LENGTH,
  ),
)

watch(isOpen, (open) => {
  if (!open) resetForm()
})

watch(
  () => props.organizationId,
  () => {
    isOpen.value = false
  },
)

async function submit(): Promise<void> {
  hasSubmitted.value = true
  feedback.value = null

  if (nameError.value !== null || hostnameError.value !== null) {
    focusFirstError()
    return
  }

  try {
    const site = await createSite({
      name: nameDraft.value.trim(),
      hostname: hostnameDraft.value.trim(),
    })
    emit('created', site)
  } catch {
    feedback.value = error.value?.message ?? 'Site creation failed. Try again.'
  }
}

function focusFirstError(): void {
  void nextTick(() => {
    const inputId = nameError.value !== null ? 'site-name' : 'site-hostname'
    document.getElementById(inputId)?.focus()
  })
}

function resetForm(): void {
  nameDraft.value = ''
  hostnameDraft.value = ''
  hasSubmitted.value = false
  feedback.value = null
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Add site</DialogTitle>
        <DialogDescription>
          Add a site to {{ organizationName }} to start collecting analytics.
        </DialogDescription>
      </DialogHeader>

      <form
        id="create-site-form"
        class="flex flex-col gap-6"
        novalidate
        :aria-busy="isCreating"
        @submit.prevent="submit"
      >
        <FieldGroup>
          <Field :data-invalid="nameError !== null">
            <FieldLabel for="site-name">Site name</FieldLabel>
            <Input
              id="site-name"
              v-model="nameDraft"
              :aria-describedby="
                nameError !== null
                  ? 'site-name-description site-name-error'
                  : 'site-name-description'
              "
              :aria-invalid="nameError !== null"
              :disabled="isCreating"
              maxlength="256"
              name="name"
              placeholder="e.g. Marketing site"
              required
            />
            <FieldDescription id="site-name-description">
              Use a name your team will recognize.
            </FieldDescription>
            <FieldError v-if="nameError" id="site-name-error">{{ nameError }}</FieldError>
          </Field>

          <Field :data-invalid="hostnameError !== null">
            <FieldLabel for="site-hostname">Hostname</FieldLabel>
            <Input
              id="site-hostname"
              v-model="hostnameDraft"
              autocapitalize="none"
              autocomplete="url"
              :aria-describedby="
                hostnameError !== null
                  ? 'site-hostname-description site-hostname-error'
                  : 'site-hostname-description'
              "
              :aria-invalid="hostnameError !== null"
              :disabled="isCreating"
              inputmode="url"
              maxlength="253"
              name="hostname"
              placeholder="e.g. www.example.com"
              required
              spellcheck="false"
            />
            <FieldDescription id="site-hostname-description">
              Enter the hostname where this site is published.
            </FieldDescription>
            <FieldError v-if="hostnameError" id="site-hostname-error">
              {{ hostnameError }}
            </FieldError>
          </Field>
        </FieldGroup>
      </form>

      <p
        class="text-muted-foreground text-sm"
        :class="{ 'sr-only': feedback === null }"
        role="status"
        aria-live="polite"
      >
        {{ feedback }}
      </p>

      <DialogFooter>
        <DialogClose as-child>
          <Button type="button" variant="outline">Cancel</Button>
        </DialogClose>
        <Button :disabled="isCreating" form="create-site-form" type="submit">
          <Spinner v-if="isCreating" aria-hidden="true" />
          {{ isCreating ? 'Adding…' : 'Add site' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
