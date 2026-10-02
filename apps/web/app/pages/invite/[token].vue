<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/composables/useAuth'
import { useOrpc } from '@/composables/useOrpc'
import { useLocalizedErrorMessage } from '@/composables/useLocalizedErrorMessage'
import { invitationRenderFor } from '@/components/features/invite/invite.utils'
import {
  normalizeSettingsError,
  isLocalizableSettingsError,
} from '@/components/features/organization-settings/organization-settings.utils'
import type { CimiOrpc } from '~/plugins/orpc'
import type { SettingsError } from '@/utils/settings-error'
import { isStringValue } from '../../utils/type-guards'

definePageMeta({
  layout: 'bare',
  auth: false,
})

type AcceptedMembership = Awaited<ReturnType<CimiOrpc['invitation']['acceptInvitation']['call']>>

type InvitationFailure =
  | { readonly kind: 'local'; readonly messageKey: InviteMessageKey }
  | { readonly kind: 'remote'; readonly error: SettingsError }

type InviteMessageKey = 'invite.missingToken' | 'invite.acceptFailed'

type InvitationState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'accepted'; readonly membership: AcceptedMembership }
  | { readonly status: 'error'; readonly failure: InvitationFailure }

const route = useRoute()

const { t } = useI18n()

const auth = useAuth()

const orpc = useOrpc()

const localizeError = useLocalizedErrorMessage()

const token = computed(() => (isStringValue(route.params.token) ? route.params.token : ''))

const state = shallowRef<InvitationState>({ status: 'idle' })

const hydrated = ref(false)

const render = computed(() =>
  invitationRenderFor({
    hydrated: hydrated.value,
    sessionStatus: auth.session.value.status,
    invitationStatus: state.value.status,
  }),
)

const errorMessage = computed(() => {
  const currentState = state.value

  if (currentState.status !== 'error') return ''

  if (currentState.failure.kind === 'local') return t(currentState.failure.messageKey)

  const { error } = currentState.failure

  return isLocalizableSettingsError(error) ? localizeError(error) : t('invite.acceptFailed')
})

onMounted(() => {
  hydrated.value = true
})

watch(
  () => auth.session.value.status,
  (status) => {
    if (status === 'authenticated' && state.value.status === 'idle') void acceptInvitation()
  },
  { immediate: true },
)

async function acceptInvitation(): Promise<void> {
  if (token.value.length === 0) {
    state.value = { status: 'error', failure: { kind: 'local', messageKey: 'invite.missingToken' } }

    return
  }

  state.value = { status: 'loading' }

  try {
    const membership = await orpc.invitation.acceptInvitation.call({ token: token.value })
    state.value = { status: 'accepted', membership }
    await navigateTo(`/org/${membership.organizationId}/settings/members`)
  } catch (error: unknown) {
    state.value = {
      status: 'error',
      failure: { kind: 'remote', error: normalizeSettingsError(error) },
    }
  }
}
</script>

<template>
  <main class="bg-muted flex min-h-svh items-center justify-center p-6 md:p-10">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle
          ><h1>{{ t('invite.title') }}</h1></CardTitle
        >
        <CardDescription>{{ t('invite.description') }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <div
          v-if="render.view === 'loading'"
          class="text-muted-foreground flex items-center gap-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <Spinner aria-hidden="true" />
          {{ t(render.loadingMessageKey) }}
        </div>

        <template v-else-if="render.view === 'signedOut'">
          <p class="text-sm">{{ t('invite.signedOutPrompt') }}</p>
          <div class="flex flex-wrap gap-2">
            <Button as-child>
              <NuxtLinkLocale :to="{ path: '/login', query: { redirect: route.fullPath } }">
                {{ t('invite.signIn') }}
              </NuxtLinkLocale>
            </Button>
            <Button as-child variant="outline">
              <NuxtLinkLocale :to="{ path: '/signup', query: { redirect: route.fullPath } }">
                {{ t('invite.createAccount') }}
              </NuxtLinkLocale>
            </Button>
          </div>
        </template>

        <Alert v-else-if="render.view === 'error'" variant="destructive">
          <AlertTitle>{{ t('invite.errorTitle') }}</AlertTitle>
          <AlertDescription>{{ errorMessage }}</AlertDescription>
        </Alert>

        <Alert v-else-if="render.view === 'accepted'">
          <AlertTitle>{{ t('invite.acceptedTitle') }}</AlertTitle>
          <AlertDescription>{{ t('invite.acceptedDescription') }}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  </main>
</template>
