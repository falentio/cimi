import type { AuthState } from '@/composables/useAuth'
import { resolveAuthDecision, toRouteLocation } from '@/utils/auth-guard'
import { authStateFromPayload } from '@/utils/auth-session'

export default defineNuxtRouteMiddleware(async (to) => {
  const localePath = useLocalePath()

  if (import.meta.server && to.meta.auth === false) return undefined

  const state = import.meta.server ? await probeServerSession() : await refreshClientSession()
  const userRole = state.status === 'authenticated' ? state.session.user.role : null
  const decision = resolveAuthDecision(to, state.status, userRole)

  if (decision === undefined) return undefined

  return navigateTo(toRouteLocation(decision, localePath))
})

async function probeServerSession(): Promise<AuthState> {
  try {
    const payload: unknown = await useRequestFetch()('/api/auth/get-session')

    return authStateFromPayload(payload)
  } catch {
    return { status: 'unauthenticated' }
  }
}

async function refreshClientSession(): Promise<AuthState> {
  const auth = useAuth()

  await auth.refreshSession()

  return auth.session.value
}
