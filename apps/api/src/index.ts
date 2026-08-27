import { Hono } from 'hono'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { experimental_ValibotToJsonSchemaConverter } from '@orpc/valibot'
import { onError, ORPCError, implement } from '@orpc/server'
import { contract } from '@cimi/contract'
import type { Db } from '@cimi/db'
import type { Auth, AuthUser } from '@cimi/auth'
import type { AnalyticsDb } from '@cimi/db'
import { assertAuthorization, type AuthorizationLevel } from '@cimi/guard'
import { createHello, type HelloApiContext } from './resources/hello/index.ts'
import { systemHealthHandler, type HealthLifecycle } from './health.ts'
import { normalizeApiError } from './errors.ts'

export { normalizeApiError } from './errors.ts'

export interface CreateApiAppDependencies {
  db: Db
  auth: Auth
  analytics: AnalyticsDb
  baseUrl?: string | undefined
  lifecycle?: HealthLifecycle | undefined
}

export function createApiApp(deps: CreateApiAppDependencies): Hono {
  const api = implement({
    health: contract.health,
    hello: contract.hello,
  }).$context<HelloApiContext>()
  const hello = createHello({ db: deps.db })
  const router = api.router({
    health: {
      health: api.health.health.handler(async () => systemHealthHandler(deps)),
    },
    hello: hello.router,
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
    return deps.auth.handler(c.req.raw)
  })

  app.on(['GET', 'POST', 'OPTIONS'], '/api/*', async (c) => {
    const { matched, response } = await openAPIHandler.handle(c.req.raw, {
      prefix: '/api',
      context: { user: await getUser(deps.auth, c.req.raw) },
    })
    if (matched && response) return response
    return new Response('Not Found', { status: 404 })
  })

  return app
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
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    return session?.user
  } catch {
    return undefined
  }
}
