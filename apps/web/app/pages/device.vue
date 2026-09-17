<script setup lang="ts">
import { computed, shallowRef } from 'vue'

definePageMeta({
  layout: 'bare',
  auth: false,
})

const route = useRoute()
const auth = useAuth()
const userCode = shallowRef(normalizeUserCode(route.query.user_code))
const pending = shallowRef(false)
const error = shallowRef<string | undefined>()

const hasCode = computed(() => userCode.value.length > 0)

async function continueAuthorization(): Promise<void> {
  if (pending.value) return
  const code = normalizeUserCode(userCode.value)
  if (code.length === 0) {
    error.value = 'Enter the device code shown in your terminal.'
    return
  }

  pending.value = true
  error.value = undefined
  userCode.value = code

  try {
    if (auth.session.value.status !== 'authenticated') await auth.refreshSession()
    if (auth.session.value.status !== 'authenticated') {
      await navigateTo({
        path: '/login',
        query: { redirect: `/device?user_code=${encodeURIComponent(code)}` },
      })
      return
    }

    const result = await useNuxtApp().$authClient.device({ query: { user_code: code } })
    if (result.error || result.data === null) {
      error.value = 'That device code is invalid or has expired.'
      return
    }
    await navigateTo({ path: '/device/approve', query: { user_code: code } })
  } catch {
    error.value = 'The device code could not be verified. Try again.'
  } finally {
    pending.value = false
  }
}

function normalizeUserCode(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^a-z0-9]/gi, '').toUpperCase() : ''
}
</script>

<template>
  <main class="bg-muted flex min-h-svh items-center justify-center p-6 md:p-10">
    <UICard class="w-full max-w-md">
      <UICardHeader>
        <UICardTitle>Connect a device</UICardTitle>
        <UICardDescription>
          Enter the code shown by the Cimi CLI to securely connect it to your account.
        </UICardDescription>
      </UICardHeader>

      <UICardContent class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <UILabel for="device-code">Device code</UILabel>
          <UIInput
            id="device-code"
            v-model="userCode"
            autocomplete="one-time-code"
            autocapitalize="characters"
            :aria-invalid="error !== undefined"
            aria-describedby="device-code-help"
            inputmode="text"
            maxlength="8"
            placeholder="ABCD-EFGH"
            @keyup.enter="continueAuthorization"
          />
          <p id="device-code-help" class="text-muted-foreground text-sm">
            The code is case-insensitive. Do not approve a code you did not request.
          </p>
        </div>
        <UIAlert v-if="error" variant="destructive">
          <UIAlertDescription>{{ error }}</UIAlertDescription>
        </UIAlert>
      </UICardContent>

      <UICardFooter>
        <UIButton class="w-full" :disabled="pending || !hasCode" @click="continueAuthorization">
          <UISpinner v-if="pending" data-icon="inline-start" />
          Continue
        </UIButton>
      </UICardFooter>
    </UICard>
  </main>
</template>
