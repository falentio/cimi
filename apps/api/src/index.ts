import { Hono } from 'hono'
import { implement } from '@orpc/server'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { experimental_ValibotToJsonSchemaConverter } from '@orpc/valibot'
import { onError } from '@orpc/server'
import { contract } from '@cimi/contract'
import type { Db } from '@cimi/db'
import type { Auth } from '@cimi/auth/server'
import type { AnalyticsDb } from '@cimi/db'
import { systemHealthHandler } from './health.ts'

export interface CreateApiAppDependencies {
  db: Db
  auth: Auth
  analytics: AnalyticsDb
  baseUrl?: string | undefined
}

export function createApiApp(deps: CreateApiAppDependencies): Hono {
  // Resource handlers are added incrementally; health is the only implemented route today.
  const router = implement(contract).router({
    health: {
      health: implement(contract).health.health.handler(async () => systemHealthHandler(deps)),
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
      context: {},
    })
    if (matched && response) return response
    return new Response('Not Found', { status: 404 })
  })

  return app
}
