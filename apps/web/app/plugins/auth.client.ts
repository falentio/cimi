import { createCimiAuthClient } from '@cimi/auth/client'
import type { createCimiAuthClient as createCimiAuthClientType } from '@cimi/auth/client'

type CimiAuthClient = ReturnType<typeof createCimiAuthClientType>

declare module '#app' {
  interface NuxtApp {
    $authClient: CimiAuthClient
  }
}

export default defineNuxtPlugin(() => {
  const authClient = createCimiAuthClient()

  return {
    provide: { authClient },
  }
})
