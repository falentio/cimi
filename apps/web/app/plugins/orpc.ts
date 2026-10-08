import { resolveAuthDecision, toRouteLocation } from '@/utils/auth-guard'
import { createClient, type Client } from '@cimi/client'
import { createORPCVueColadaUtils } from '@orpc/vue-colada'

export type CimiClient = Client

export type CimiOrpc = ReturnType<typeof createORPCVueColadaUtils<CimiClient>>

declare module '#app' {
  interface NuxtApp {
    $orpc: CimiOrpc
  }
}

export default defineNuxtPlugin(() => {
  const localePath = useLocalePath()
  const router = useRouter()
  const auth = useAuth()

  const cookie = import.meta.server ? useRequestHeaders(['cookie']).cookie : undefined
  const baseUrl = import.meta.server ? useRequestURL().origin : globalThis.location.origin

  // The API is the authorization boundary. When it rejects a call as UNAUTHORIZED the
  // cached 'authenticated' status is stale, so drop it here and hand the current route
  // to the same guard decision every navigation uses. The guard returns no decision
  // for a guest page, so a rejection while already on /login is a no-op.
  const onUnauthorized = () => {
    if (import.meta.server) return

    auth.markUnauthenticated()

    const to = router.currentRoute.value

    // The session is already dropped, so the guard only reaches its sign-in branch.
    const decision = resolveAuthDecision(to, 'unauthenticated', null)

    if (decision === undefined) return

    void router.push(toRouteLocation(decision, localePath))
  }

  const client = createClient({
    baseUrl,
    ...(cookie !== undefined && { headers: { cookie } }),
    onUnauthorized,
  })

  const orpc = createORPCVueColadaUtils(client)

  return {
    provide: { orpc },
  }
})
