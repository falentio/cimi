import { Hono } from 'hono'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { experimental_ValibotToJsonSchemaConverter } from '@orpc/valibot'
import { onError, ORPCError } from '@orpc/server'
import { ERROR_CATALOG } from '@cimi/contract'
import type { Db } from '@cimi/db'
import { createOrganizationAuthority, type Auth, type AuthUser } from '@cimi/auth'
import type { AnalyticsDb } from '@cimi/db'
import { assertAuthorization, type AuthorizationLevel } from '@cimi/guard'
import { api } from './orpc.ts'
import { createHello } from './resources/hello/index.ts'
import { createInvitation } from './resources/invitation/index.ts'
import { createMembership } from './resources/membership/index.ts'
import { createOrganization } from './resources/organization/index.ts'
import { createSite } from './resources/site/index.ts'
import { systemHealthHandler, type HealthLifecycle } from './health.ts'
import { normalizeApiError } from './errors.ts'

export { normalizeApiError } from './errors.ts'
export {
  createSiteLifecycleWorker,
  SiteLifecycleWorker,
  type CreateSiteLifecycleWorkerDependencies,
  type SiteLifecycleWorkerDependencies,
} from './resources/site/index.ts'

export interface CreateApiAppDependencies {
  db: Db
  auth: Auth
  analytics: AnalyticsDb
  baseUrl?: string | undefined
  lifecycle?: HealthLifecycle | undefined
}

export function createApiApp(deps: CreateApiAppDependencies): Hono {
  const hello = createHello({ db: deps.db })
  const authority = createOrganizationAuthority(deps.auth)
  const membership = createMembership({ db: deps.db, authority })
  const organization = createOrganization({
    db: deps.db,
    authority,
    membership: membership.service,
  })
  const site = createSite({ db: deps.db, membership: membership.service })
  const invitation = createInvitation({ db: deps.db, authority, membership: membership.service })
  const router = api.router({
    health: {
      health: api.health.health.handler(async () => systemHealthHandler(deps)),
    },
    hello: hello.router,
    organization: organization.router,
    membership: membership.router,
    site: site.router,
    invitation: invitation.router,
  })

  const openAPIHandler = new OpenAPIHandler(router, {
    interceptors: [
      onError((error) => {
        if (error instanceof ORPCError) {
          console.error({ code: error.code, status: error.status })
          return
        }
        console.error('API request failed')
      }),
    ],
    clientInterceptors: [
      async (options) => {
        try {
          return await options.next()
        } catch (error) {
          throw await normalizeApiError(error, options.procedure)
        }
      },
      (options) => {
        assertAuthorization(
          options.context['user'],
          getCoarseAuthorizationLevel(options.procedure['~orpc'].meta['auth']),
        )
        return options.next()
      },
    ],
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new experimental_ValibotToJsonSchemaConverter()],
        specGenerateOptions: {
          info: { title: 'Cimi API', version: '0.0.1' },
          servers: [{ url: '/api' }],
        },
        docsPath: '/docs',
        specPath: '/spec.json',
      }),
    ],
  })

  const app = new Hono()

  app.on(['GET', 'POST', 'OPTIONS'], '/api/auth/*', async (c) => {
    if (isNativeGovernanceMutation(c.req.raw)) return new Response('Not Found', { status: 404 })
    return deps.auth.handler(c.req.raw)
  })

  app.on(['GET', 'POST', 'OPTIONS'], '/api/*', async (c) => {
    let user: AuthUser | undefined
    try {
      user = await getUser(deps.auth, c.req.raw)
    } catch {
      return c.json(
        {
          defined: false,
          code: 'INTERNAL_SERVER_ERROR',
          status: ERROR_CATALOG.INTERNAL_SERVER_ERROR.status,
          message: ERROR_CATALOG.INTERNAL_SERVER_ERROR.message,
        },
        500,
      )
    }

    const { matched, response } = await openAPIHandler.handle(c.req.raw, {
      prefix: '/api',
      context: { user, headers: c.req.raw.headers },
    })
    if (matched && response) return response
    return new Response('Not Found', { status: 404 })
  })

  return app
}

const NATIVE_GOVERNANCE_MUTATION_PATHS = new Set([
  '/organization/create',
  '/organization/update',
  '/organization/delete',
  '/organization/invite-member',
  '/organization/add-member',
  '/organization/remove-member',
  '/organization/update-member-role',
  '/organization/leave',
  '/organization/accept-invitation',
  '/organization/reject-invitation',
  '/organization/cancel-invitation',
])

function isNativeGovernanceMutation(request: Request): boolean {
  if (request.method !== 'POST') return false
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, '').replace(/\/+$/, '')
  return NATIVE_GOVERNANCE_MUTATION_PATHS.has(path)
}

function getCoarseAuthorizationLevel(auth: string | undefined): AuthorizationLevel {
  switch (auth) {
    case 'public':
      return 'public'
    case 'installation-admin':
      return 'installation-admin'
    case 'authenticated':
    case 'admin':
    case 'owner':
      return auth
    default:
      return 'authenticated'
  }
}

async function getUser(auth: Auth, request: Request): Promise<AuthUser | undefined> {
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user
}
