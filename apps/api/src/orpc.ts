import type { AuthUser } from '@cimi/auth'
import { contract } from '@cimi/contract'
import { assertAuthenticated, assertIsAdmin } from '@cimi/guard'
import { implement } from '@orpc/server'
import type { IngestionAdmission } from './health.ts'

export interface ApiContext {
  user: AuthUser | undefined
  headers: Headers
  admission?: IngestionAdmission | undefined
}

export const api = implement({
  health: contract.health,
  hello: contract.hello,
  installation: contract.installation,
  organization: contract.organization,
  membership: contract.membership,
  site: contract.site,
  invitation: contract.invitation,
}).$context<ApiContext>()

const authenticatedMiddleware = api.middleware(({ context, next }) => {
  assertAuthenticated(context.user)
  return next({
    context: { user: context.user, headers: context.headers, admission: context.admission },
  })
})

export const authenticatedApi = api.use(authenticatedMiddleware)

const adminMiddleware = api.middleware(({ context, next }) => {
  assertAuthenticated(context.user)
  assertIsAdmin(context.user)
  return next({
    context: { user: context.user, headers: context.headers, admission: context.admission },
  })
})

export const adminApi = authenticatedApi.use(adminMiddleware)
