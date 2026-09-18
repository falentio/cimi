import { resolveAuthDecision } from '@/utils/auth-guard'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const auth = useAuth()
  const localePath = useLocalePath()

  if (auth.session.value.status !== 'authenticated') {
    await auth.refreshSession()
  }

  const state = auth.session.value
  const userRole = state.status === 'authenticated' ? state.session.user.role : null
  const decision = resolveAuthDecision(to, state.status, userRole)

  if (!decision) return undefined

  if (decision.path === '/login') {
    return navigateTo({ ...decision, path: localePath('login') })
  }

  if (decision.path === '/') {
    return navigateTo({ ...decision, path: localePath('index') })
  }

  return navigateTo(decision)
})
