import { Hono } from 'hono'
import { honoLogger } from '@logtape/hono'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { experimental_ValibotToJsonSchemaConverter } from '@orpc/valibot'
import { onError, ORPCError } from '@orpc/server'
import {
  COLLECT_EVENT_MAX_RAW_REQUEST_BYTES,
  ERROR_CATALOG,
  EVENT_RAW_REQUEST_LIMITS,
  isProfileTraitsPayloadOversized,
} from '@cimi/contract'
import type { Auth, AuthUser } from '@cimi/auth'
import { getLogger, toLogError } from '@cimi/logging'
import { configureNodeLogging } from '@cimi/logging/node'
import { assertAuthorization, type AuthorizationLevel } from '@cimi/guard'
import { isRecord } from '@cimi/utils'
import { resolveRequestAdmissionGate, systemHealthHandler } from './health.ts'
import { normalizeApiError } from './errors.ts'
import { isParsedPayloadOversized } from './resources/event-ingestion/payload-size.ts'
import type { ApiComposition, CreateApiAppDependencies } from './composition.ts'

export type ApiApp = Hono & { close(): Promise<void> }

export function createApiHttpApp(
  deps: CreateApiAppDependencies,
  composition: ApiComposition,
): ApiApp {
  configureNodeLogging(deps.logging)
  const logger = getLogger(['cimi', 'api'])
  const { lifecycle, router } = composition
  const openAPIHandler = new OpenAPIHandler(router, {
    interceptors: [
      onError((error) => {
        if (error instanceof ORPCError) {
          logger.error('API request failed', {
            code: error.code,
            status: error.status,
          })
          return
        }
        logger.error('API request failed', { error: toLogError(error) })
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
      async (options) => {
        const requestGate = await resolveRequestAdmissionGate({ ...deps, lifecycle })
        const { status, admissionMode, ...gate } = requestGate
        options.context['admission'] = gate.ingestion
        if (isAdmissionExempt(options.path, options.procedure['~orpc'].meta['admission'])) {
          return options.next()
        }
        if (options.procedure['~orpc'].meta['admission'] === 'analytics-read') {
          if (gate.analyticsReads === 'unavailable') throw admissionUnavailable()
          return options.next()
        }
        if (options.procedure['~orpc'].meta['admission'] === 'ingestion') {
          if (gate.ingestion === 'paused') throw admissionUnavailable()
          return options.next()
        }
        if (
          gate.ingestion === 'paused' &&
          (status === 'maintenance' || status === 'unavailable' || admissionMode !== 'normal')
        ) {
          throw admissionUnavailable()
        }
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
  app.use(
    '*',
    honoLogger({
      category: ['cimi', 'api', 'http'],
      format: 'structured-combined',
      context: true,
    }),
  )

  app.get('/api/system/health', async () => {
    const health = await systemHealthHandler({ ...deps, lifecycle })
    return Response.json(health)
  })

  app.on(['GET', 'POST', 'OPTIONS'], '/api/auth/*', async (c) => {
    if (isNativeGovernanceMutation(c.req.raw)) return new Response('Not Found', { status: 404 })
    return deps.auth.handler(c.req.raw)
  })

  app.on(['GET', 'POST', 'OPTIONS'], '/api/*', async (c) => {
    const rawLimit = eventRawRequestLimit(c.req.raw)
    const request =
      rawLimit === undefined ? c.req.raw : await readRequestWithinLimit(c.req.raw, rawLimit)
    if (request instanceof Response) return request
    if (rawLimit === COLLECT_EVENT_MAX_RAW_REQUEST_BYTES && (await parsedPayloadTooLarge(request)))
      return payloadTooLargeResponse()
    if (await identityProfilePayloadTooLarge(request)) return payloadTooLargeResponse()
    let user: AuthUser | undefined
    try {
      user = await getUser(deps.auth, request)
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

    const { matched, response } = await openAPIHandler.handle(request, {
      prefix: '/api',
      context: { user, headers: request.headers },
    })
    if (matched && response) return response
    return new Response('Not Found', { status: 404 })
  })

  return Object.assign(app, { close: () => composition.close() })
}

async function readRequestWithinLimit(
  request: Request,
  limit: number,
): Promise<Request | Response> {
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > limit) return payloadTooLargeResponse()
  if (request.body === null) return request

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > limit) {
      await reader.cancel()
      return payloadTooLargeResponse()
    }
    chunks.push(next.value)
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Request(request, { method: request.method, body: new Blob([body.buffer]) })
}

async function parsedPayloadTooLarge(request: Request): Promise<boolean> {
  try {
    const value: unknown = JSON.parse(await request.clone().text())
    return isParsedPayloadOversized(value)
  } catch {
    return false
  }
}

async function identityProfilePayloadTooLarge(request: Request): Promise<boolean> {
  const path = new URL(request.url).pathname.replace(/^\/api/, '').replace(/\/+$/, '')
  if (request.method !== 'POST' || path !== '/identity-profile/identify') return false
  try {
    const value: unknown = JSON.parse(await request.clone().text())
    return isRecord(value) && isProfileTraitsPayloadOversized(value['traits'])
  } catch {
    return false
  }
}

function eventRawRequestLimit(request: Request): number | undefined {
  const path = new URL(request.url).pathname.replace(/^\/api/, '').replace(/\/+$/, '')
  if (request.method !== 'POST') return undefined
  return EVENT_RAW_REQUEST_LIMITS[path]
}

function payloadTooLargeResponse(): Response {
  const definition = ERROR_CATALOG.PAYLOAD_TOO_LARGE
  return Response.json(
    {
      defined: false,
      code: definition.code,
      status: definition.status,
      message: definition.message,
    },
    { status: definition.status },
  )
}

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

const ADMISSION_EXEMPT_RESOURCES = new Set(['health', 'installation', 'backupRestore'])

function isAdmissionExempt(path: readonly string[], admission: string | undefined): boolean {
  if (admission === 'exempt') return true
  return path.length > 0 && ADMISSION_EXEMPT_RESOURCES.has(path[0]!)
}

function admissionUnavailable(): ORPCError<string, unknown> {
  return new ORPCError('SERVICE_UNAVAILABLE', {
    status: ERROR_CATALOG.SERVICE_UNAVAILABLE.status,
    message: ERROR_CATALOG.SERVICE_UNAVAILABLE.message,
  })
}

async function getUser(auth: Auth, request: Request): Promise<AuthUser | undefined> {
  const session = await auth.api.getSession({ headers: request.headers })
  const sessionUser: AuthUser | undefined = session?.user
  if (sessionUser === undefined) return undefined
  return {
    ...sessionUser,
    installationGrant: sessionUser.installationGrant ?? sessionUser.role === 'admin',
  }
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
