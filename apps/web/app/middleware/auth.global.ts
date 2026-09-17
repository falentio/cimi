import { resolveAuthDecision } from '@/utils/auth-guard'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const auth = useAuth()

  if (auth.session.value.status !== 'authenticated') {
    await auth.refreshSession()
  }

  const state = auth.session.value
  const userRole = state.status === 'authenticated' ? state.session.user.role : null
  const decision = resolveAuthDecision(to, state.status, userRole)

  return decision ? navigateTo(decision) : undefined
})
