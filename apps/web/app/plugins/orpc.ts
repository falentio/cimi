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
  const cookie = import.meta.server ? useRequestHeaders(['cookie']).cookie : undefined
  const baseUrl = import.meta.server ? useRequestURL().origin : globalThis.location.origin
  const client = createClient({
    baseUrl,
    ...(cookie === undefined ? {} : { headers: { cookie } }),
  })
  const orpc = createORPCVueColadaUtils(client)

  return {
    provide: { orpc },
  }
})
