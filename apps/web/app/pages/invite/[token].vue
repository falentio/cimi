<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/composables/useAuth'
import { useOrpc } from '@/composables/useOrpc'
import { normalizeSettingsError } from '@/components/features/organization-settings/organization-settings.utils'
import type { CimiOrpc } from '~/plugins/orpc'

definePageMeta({
  layout: 'bare',
  auth: false,
})

type AcceptedMembership = Awaited<ReturnType<CimiOrpc['invitation']['acceptInvitation']['call']>>

type InvitationState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'accepted'; readonly membership: AcceptedMembership }
  | { readonly status: 'error'; readonly message: string }

const route = useRoute()
const auth = useAuth()
const orpc = useOrpc()
const token = computed(() => (typeof route.params.token === 'string' ? route.params.token : ''))
const state = shallowRef<InvitationState>({ status: 'idle' })

watch(
  () => auth.session.value.status,
  (status) => {
    if (status === 'authenticated' && state.value.status === 'idle') void acceptInvitation()
  },
  { immediate: true },
)

async function acceptInvitation(): Promise<void> {
  if (token.value.length === 0) {
    state.value = { status: 'error', message: 'This invitation link is missing its token.' }
    return
  }

  state.value = { status: 'loading' }
  try {
    const membership = await orpc.invitation.acceptInvitation.call({ token: token.value })
    state.value = { status: 'accepted', membership }
    await navigateTo({
      path: '/settings/members',
      query: { organizationId: membership.organizationId },
    })
  } catch (error: unknown) {
    state.value = { status: 'error', message: normalizeSettingsError(error).message }
  }
}
</script>

<template>
  <main class="bg-muted flex min-h-svh items-center justify-center p-6 md:p-10">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle><h1>Organization invitation</h1></CardTitle>
        <CardDescription>Join an organization in your Cimi workspace.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <div
          v-if="auth.session.value.status === 'loading' || state.status === 'loading'"
          class="text-muted-foreground flex items-center gap-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <Spinner aria-hidden="true" />
          {{
            auth.session.value.status === 'loading'
              ? 'Checking your session…'
              : 'Accepting invitation…'
          }}
        </div>

        <template v-else-if="auth.session.value.status !== 'authenticated'">
          <p class="text-sm">Sign in or create an account to accept this invitation.</p>
          <div class="flex flex-wrap gap-2">
            <Button as-child>
              <NuxtLink :to="{ path: '/login', query: { redirect: route.fullPath } }">
                Sign in to accept
              </NuxtLink>
            </Button>
            <Button as-child variant="outline">
              <NuxtLink :to="{ path: '/signup', query: { redirect: route.fullPath } }">
                Create an account
              </NuxtLink>
            </Button>
          </div>
        </template>

        <Alert v-else-if="state.status === 'error'" variant="destructive">
          <AlertTitle>Invitation could not be accepted</AlertTitle>
          <AlertDescription>{{ state.message }}</AlertDescription>
        </Alert>

        <Alert v-else-if="state.status === 'accepted'">
          <AlertTitle>Invitation accepted</AlertTitle>
          <AlertDescription>Opening your organization members page.</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  </main>
</template>
