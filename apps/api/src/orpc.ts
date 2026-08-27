import type { AuthUser } from '@cimi/auth'
import { contract } from '@cimi/contract'
import { assertAuthenticated } from '@cimi/guard'
import { implement } from '@orpc/server'

export interface ApiContext {
  user: AuthUser | undefined
}

export const api = implement({
  health: contract.health,
  hello: contract.hello,
}).$context<ApiContext>()

const authenticatedMiddleware = api.middleware(({ context, next }) => {
  assertAuthenticated(context.user)
  return next({ context: { user: context.user } })
})

export const authenticatedApi = api.use(authenticatedMiddleware)
