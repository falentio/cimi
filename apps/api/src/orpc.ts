import type { AuthUser } from '@cimi/auth'
import { contract } from '@cimi/contract'
import { assertAuthenticated, assertIsAdmin } from '@cimi/guard'
import { implement } from '@orpc/server'
import type { IngestionAdmission } from './health.ts'

export interface ApiContext {
  user: AuthUser | undefined
  headers: Headers
  requestId: string
  method: string
  path: string
  procedure?: string | undefined
  sourceIp?: string | undefined
  admission?: IngestionAdmission | undefined
}

export const api = implement({
  health: contract.health,
  hello: contract.hello,
  installation: contract.installation,
  organization: contract.organization,
  membership: contract.membership,
  collectionPolicy: contract.collectionPolicy,
  retentionPolicy: contract.retentionPolicy,
  site: contract.site,
  invitation: contract.invitation,
  backupRestore: contract.backupRestore,
  eventIngestion: contract.eventIngestion,
  identityProfile: contract.identityProfile,
  goal: contract.goal,
  funnel: contract.funnel,
  cohortRetention: contract.cohortRetention,
  trafficReport: contract.trafficReport,
  eventReport: contract.eventReport,
  publicDashboard: contract.publicDashboard,
}).$context<ApiContext>()

const authenticatedMiddleware = api.middleware(({ context, next }) => {
  assertAuthenticated(context.user)
  return next({
    context: {
      user: context.user,
      headers: context.headers,
      requestId: context.requestId,
      method: context.method,
      path: context.path,
      procedure: context.procedure,
      sourceIp: context.sourceIp,
      admission: context.admission,
    },
  })
})

export const authenticatedApi = api.use(authenticatedMiddleware)

const adminMiddleware = api.middleware(({ context, next }) => {
  assertAuthenticated(context.user)
  assertIsAdmin(context.user)
  return next({
    context: {
      user: context.user,
      headers: context.headers,
      requestId: context.requestId,
      method: context.method,
      path: context.path,
      procedure: context.procedure,
      sourceIp: context.sourceIp,
      admission: context.admission,
    },
  })
})

export const adminApi = authenticatedApi.use(adminMiddleware)
