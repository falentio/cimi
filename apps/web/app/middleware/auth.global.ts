import { resolveAuthDecision, toRouteLocation } from '@/utils/auth-guard'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const auth = useAuth()
  const localePath = useLocalePath()

  // The cached status is display state. The server owns the session, so re-derive
  // it on every navigation rather than trusting a status that a server-side revoke
  // or expiry has already invalidated.
  await auth.refreshSession()

  const state = auth.session.value
  const userRole = state.status === 'authenticated' ? state.session.user.role : null
  const decision = resolveAuthDecision(to, state.status, userRole)

  if (decision === undefined) return undefined

  return navigateTo(toRouteLocation(decision, localePath))
})
