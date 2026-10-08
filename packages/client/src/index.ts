import { createORPCClient, toORPCError } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import { contract } from '@cimi/contract'
import type { JsonifiedClient } from '@orpc/openapi-client'
import type { ContractRouterClient } from '@orpc/contract'

export interface CreateClientOptions {
  baseUrl: string
  /**
   * Called when the server rejects a call as UNAUTHORIZED. The caller decides what
   * to do with it; this package only reports that the session is no longer valid.
   */
  onUnauthorized?: (() => void) | undefined
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
}

const UNAUTHORIZED_CODE = 'UNAUTHORIZED'

const UNAUTHORIZED_STATUS = 401

function isUnauthorized(cause: unknown): boolean {
  const error = toORPCError(cause)

  return error.code === UNAUTHORIZED_CODE || error.status === UNAUTHORIZED_STATUS
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
    interceptors: [
      (interceptor) =>
        interceptor.next().catch((cause: unknown) => {
          if (options.onUnauthorized !== undefined && isUnauthorized(cause)) {
            options.onUnauthorized()
          }

          return Promise.reject(cause)
        }),
    ],
  })

  // SAFETY: OpenAPILink serves the contract router, so the client shape matches by construction.
  return createORPCClient(link) as JsonifiedClient<ContractRouterClient<typeof contract>>
}

export type Client = JsonifiedClient<ContractRouterClient<typeof contract>>
