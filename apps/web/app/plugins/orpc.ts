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

  const onUnauthorized = () => {
    if (import.meta.server) return

    auth.markUnauthenticated()

    const to = router.currentRoute.value

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
