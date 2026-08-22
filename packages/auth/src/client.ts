import { createAuthClient } from 'better-auth/client'
import { adminClient } from 'better-auth/client/plugins'

export interface CreateCimiAuthClientOptions {
  baseURL?: string | undefined
  fetch?: typeof fetch | undefined
}

export function createCimiAuthClient(options?: CreateCimiAuthClientOptions) {
  return createAuthClient({
    ...(options?.baseURL && { baseURL: options.baseURL }),
    ...(options?.fetch && { fetch: options.fetch }),
    plugins: [adminClient()],
  })
}
