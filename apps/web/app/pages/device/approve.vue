<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'

definePageMeta({
  layout: 'bare',
})

interface DeviceRequest {
  readonly clientId: string
  readonly scope: string
}

const route = useRoute()
const userCode = typeof route.query.user_code === 'string' ? route.query.user_code : ''
const request = shallowRef<DeviceRequest>()
const pending = shallowRef(false)
const outcome = shallowRef<'approved' | 'denied' | undefined>()
const error = shallowRef<string | undefined>()

onMounted(async () => {
  if (userCode.length === 0) {
    error.value = 'This device authorization link is missing its code.'
    return
  }

  try {
    const result = await useNuxtApp().$authClient.device({ query: { user_code: userCode } })
    if (result.error || result.data === null) {
      error.value = 'That device authorization is invalid or has expired.'
      return
    }
    request.value = toDeviceRequest(result.data)
  } catch {
    error.value = 'The device authorization request could not be loaded.'
  }
})

async function approve(): Promise<void> {
  await decide('approved')
}

async function deny(): Promise<void> {
  await decide('denied')
}

async function decide(nextOutcome: 'approved' | 'denied'): Promise<void> {
  if (pending.value || outcome.value !== undefined) return
  pending.value = true
  error.value = undefined
  try {
    const result =
      nextOutcome === 'approved'
        ? await useNuxtApp().$authClient.device.approve({ userCode })
        : await useNuxtApp().$authClient.device.deny({ userCode })
    if (result.error) {
      error.value = 'The device authorization could not be updated. Try again.'
      return
    }
    outcome.value = nextOutcome
  } catch {
    error.value = 'The device authorization could not be updated. Try again.'
  } finally {
    pending.value = false
  }
}

function toDeviceRequest(value: unknown): DeviceRequest {
  if (!isRecord(value)) return { clientId: 'Cimi CLI', scope: 'standard account access' }
  return {
    clientId: typeof value['client_id'] === 'string' ? value['client_id'] : 'Cimi CLI',
    scope: typeof value['scope'] === 'string' ? value['scope'] : 'standard account access',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
</script>

<template>
  <main class="bg-muted flex min-h-svh items-center justify-center p-6 md:p-10">
    <UICard class="w-full max-w-md">
      <UICardHeader>
        <UICardTitle>
          {{
            outcome === 'approved'
              ? 'Device connected'
              : outcome === 'denied'
                ? 'Device denied'
                : 'Connect this device?'
          }}
        </UICardTitle>
        <UICardDescription v-if="outcome === undefined">
          Review the request before giving the Cimi CLI access to your account.
        </UICardDescription>
        <UICardDescription v-else-if="outcome === 'approved'">
          Return to your terminal. It can now finish signing in.
        </UICardDescription>
        <UICardDescription v-else> The CLI will not receive an account session. </UICardDescription>
      </UICardHeader>

      <UICardContent class="flex flex-col gap-4">
        <dl
          v-if="request && outcome === undefined"
          class="divide-border divide-y rounded-lg border text-sm"
        >
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <dt class="text-muted-foreground">Application</dt>
            <dd class="font-medium">{{ request.clientId }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <dt class="text-muted-foreground">Access</dt>
            <dd class="font-medium">{{ request.scope }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <dt class="text-muted-foreground">Code</dt>
            <dd class="font-mono font-medium tracking-widest">{{ userCode }}</dd>
          </div>
        </dl>
        <UIAlert v-if="error" variant="destructive">
          <UIAlertDescription>{{ error }}</UIAlertDescription>
        </UIAlert>
      </UICardContent>

      <UICardFooter v-if="outcome === undefined" class="flex gap-3">
        <UIButton class="flex-1" variant="outline" :disabled="pending" @click="deny">
          Deny
        </UIButton>
        <UIButton class="flex-1" :disabled="pending || request === undefined" @click="approve">
          <UISpinner v-if="pending" data-icon="inline-start" />
          Approve
        </UIButton>
      </UICardFooter>
    </UICard>
  </main>
</template>
