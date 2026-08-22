import { createORPCClient } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { contract } from '@cimi/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import type { ContractRouterClient } from '@orpc/contract'

export interface CreateClientOptions {
  baseUrl: string
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
}

export function createClient(options: CreateClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const link = new OpenAPILink(contract, {
    url: `${baseUrl}/api`,
    ...(options.headers && { headers: options.headers }),
    fetch: (request, init) =>
      globalThis.fetch(request, {
        ...init,
        credentials: 'include',
      }),
  })

  return createORPCClient(link) as JsonifiedClient<ContractRouterClient<typeof contract>>
}

export type Client = JsonifiedClient<ContractRouterClient<typeof contract>>
