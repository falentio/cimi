import { Hono } from 'hono'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { experimental_ValibotToJsonSchemaConverter } from '@orpc/valibot'
import { onError, implement } from '@orpc/server'
import { contract } from '@cimi/contract'
import type { Db } from '@cimi/db'
import type { Auth, AuthUser } from '@cimi/auth'
import type { AnalyticsDb } from '@cimi/db'
import { createHello, helloRouter, type HelloApiContext } from './resources/hello/index.ts'
import { systemHealthHandler, type HealthLifecycle } from './health.ts'

export interface CreateApiAppDependencies {
  db: Db
  auth: Auth
  analytics: AnalyticsDb
  baseUrl?: string | undefined
  lifecycle?: HealthLifecycle | undefined
}

export function createApiApp(deps: CreateApiAppDependencies): Hono {
  const api = implement(contract).$context<HelloApiContext>()
  const hello = createHello({ db: deps.db })
  const helloHandlers = helloRouter(hello.service)
  const router = api.router({
    health: {
      health: api.health.health.handler(async () => systemHealthHandler(deps)),
    },
    hello: {
      list: api.hello.list.handler(helloHandlers.list),
      get: api.hello.get.handler(helloHandlers.get),
      world: api.hello.world.handler(helloHandlers.world),
      create: api.hello.create.handler(helloHandlers.create),
      remove: api.hello.remove.handler(helloHandlers.remove),
    },
  } as never)

  const openAPIHandler = new OpenAPIHandler(router, {
    interceptors: [
      onError((error) => {
        console.error(error)
      }),
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

async function getUser(auth: Auth, request: Request): Promise<AuthUser | undefined> {
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    return session?.user
  } catch {
    return undefined
  }
}
