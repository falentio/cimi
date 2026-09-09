export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server || (to.path !== '/app' && !to.path.startsWith('/app/'))) return

  const { session, refreshSession } = useAuth()

  if (session.value.status === 'authenticated') return

  const result = await refreshSession()
  if (result.ok && result.session !== null) return

  return navigateTo({
    path: '/login',
    query: { redirect: to.fullPath },
  })
})
