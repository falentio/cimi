<script setup lang="ts">
import { shallowRef } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { SetupController, UpgradeView } from './setup.types'

const props = defineProps<{
  upgrade: UpgradeView
  refresh: SetupController['refresh']
  beginUpgrade: SetupController['beginUpgrade']
  cancelUpgrade: SetupController['cancelUpgrade']
  submitUpgrade: SetupController['submitUpgrade']
}>()

const confirmation = shallowRef('')
const retrying = shallowRef(false)

async function refreshStatus(): Promise<void> {
  retrying.value = true
  try {
    await props.refresh()
  } catch {
    return
  } finally {
    retrying.value = false
  }
}

async function submit(): Promise<void> {
  try {
    await props.submitUpgrade(confirmation.value)
  } catch {
    return
  }
}

function begin(): void {
  confirmation.value = ''
  props.beginUpgrade()
}

function cancel(): void {
  confirmation.value = ''
  props.cancelUpgrade()
}
</script>

<template>
  <Card v-if="upgrade.kind === 'available'">
    <CardHeader>
      <CardTitle>Upgrade installation</CardTitle>
      <CardDescription
        >Upgrades create a safety backup and may briefly pause new work.</CardDescription
      >
    </CardHeader>
    <CardContent>
      <Button type="button" @click="begin">Upgrade installation</Button>
    </CardContent>
  </Card>

  <Card v-else-if="upgrade.kind === 'blocked'">
    <CardHeader>
      <CardTitle>Upgrade is not available</CardTitle>
      <CardDescription>
        {{
          upgrade.reason === 'operation-active'
            ? 'Another lifecycle operation is active. Refresh this page before trying again.'
            : 'The installation must be ready before it can be upgraded.'
        }}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Button type="button" variant="outline" :disabled="retrying" @click="refreshStatus">
        <Spinner v-if="retrying" aria-hidden="true" />
        {{ retrying ? 'Refreshing...' : 'Refresh status' }}
      </Button>
    </CardContent>
  </Card>

  <Card v-else-if="upgrade.kind === 'confirming' || upgrade.kind === 'confirmation-required'">
    <CardHeader>
      <CardTitle>Confirm installation upgrade</CardTitle>
      <CardDescription>Type the exact confirmation phrase to start the upgrade.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="space-y-4" @submit.prevent="submit">
        <Field :data-invalid="upgrade.kind === 'confirmation-required'">
          <FieldLabel for="setup-upgrade-confirmation">Confirmation</FieldLabel>
          <Input
            id="setup-upgrade-confirmation"
            v-model="confirmation"
            autocomplete="off"
            spellcheck="false"
            aria-describedby="setup-upgrade-confirmation-description"
            :aria-invalid="upgrade.kind === 'confirmation-required'"
          />
          <FieldDescription id="setup-upgrade-confirmation-description">
            Enter UPGRADE in uppercase with no extra spaces.
          </FieldDescription>
        </Field>
        <p
          v-if="upgrade.kind === 'confirmation-required'"
          class="text-destructive text-sm"
          role="alert"
        >
          {{ upgrade.error.message }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button type="submit">Start upgrade</Button>
          <Button type="button" variant="ghost" @click="cancel">Cancel</Button>
        </div>
      </form>
    </CardContent>
  </Card>

  <Alert v-else-if="upgrade.kind === 'submitting'">
    <Spinner aria-hidden="true" />
    <AlertTitle>Starting upgrade</AlertTitle>
    <AlertDescription>Preparing the safe lifecycle operation.</AlertDescription>
  </Alert>

  <Alert v-else-if="upgrade.kind === 'completed'">
    <AlertTitle>Upgrade complete</AlertTitle>
    <AlertDescription>Refresh the health report to confirm both stores are ready.</AlertDescription>
    <Button class="mt-3" size="sm" variant="outline" :disabled="retrying" @click="refreshStatus">
      <Spinner v-if="retrying" aria-hidden="true" />
      {{ retrying ? 'Refreshing...' : 'Refresh health' }}
    </Button>
  </Alert>

  <Alert v-else-if="upgrade.kind === 'failure'" variant="destructive">
    <AlertTitle>Upgrade needs attention</AlertTitle>
    <AlertDescription>{{ upgrade.error.message }}</AlertDescription>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" @click="begin">Try upgrade again</Button>
      <Button size="sm" variant="ghost" :disabled="retrying" @click="refreshStatus">
        <Spinner v-if="retrying" aria-hidden="true" />
        {{ retrying ? 'Refreshing...' : 'Refresh status' }}
      </Button>
    </div>
  </Alert>
</template>
