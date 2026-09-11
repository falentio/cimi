<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue'
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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const isOpen = defineModel<boolean>('open', { default: false })
const organizationName = shallowRef('')
const hasSubmitted = shallowRef(false)
const feedback = shallowRef<string | null>(null)

const nameError = computed(() => {
  if (!hasSubmitted.value || organizationName.value.trim().length > 0) return null
  return 'Enter an organization name.'
})

watch(isOpen, (open) => {
  if (!open) resetForm()
})

function submit(): void {
  hasSubmitted.value = true
  feedback.value = null

  if (nameError.value !== null) {
    void nextTick(() => document.getElementById('organization-name')?.focus())
    return
  }

  feedback.value = 'Organization creation is not connected yet. Nothing was saved.'
}

function resetForm(): void {
  organizationName.value = ''
  hasSubmitted.value = false
  feedback.value = null
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Create organization</DialogTitle>
        <DialogDescription>
          Create a shared space for your team, sites, and analytics.
        </DialogDescription>
      </DialogHeader>

      <form
        id="create-organization-form"
        class="flex flex-col gap-6"
        novalidate
        @submit.prevent="submit"
      >
        <Field :data-invalid="nameError !== null">
          <FieldLabel for="organization-name">Organization name</FieldLabel>
          <Input
            id="organization-name"
            v-model="organizationName"
            autocomplete="organization"
            :aria-describedby="
              nameError
                ? 'organization-name-description organization-name-error'
                : 'organization-name-description'
            "
            :aria-invalid="nameError !== null"
            maxlength="256"
            name="organizationName"
            placeholder="e.g. Northstar Analytics"
            required
            type="text"
          />
          <FieldDescription id="organization-name-description">
            Use a name your team will recognize in the workspace switcher.
          </FieldDescription>
          <FieldError v-if="nameError" id="organization-name-error">
            {{ nameError }}
          </FieldError>
        </Field>
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
        <Button form="create-organization-form" type="submit">Create organization</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
