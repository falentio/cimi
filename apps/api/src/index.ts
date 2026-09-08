import { Hono } from 'hono'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { experimental_ValibotToJsonSchemaConverter } from '@orpc/valibot'
import { onError, ORPCError } from '@orpc/server'
import { ERROR_CATALOG } from '@cimi/contract'
import type { Db } from '@cimi/db'
import { createOrganizationAuthority, type Auth, type AuthUser } from '@cimi/auth'
import type { AnalyticsDb } from '@cimi/db'
import {
  InMemoryLifecycleLock,
  type AcceptanceJournalPort,
  type AcceptanceQuiescencePort,
  type LifecycleLock,
  type ReadQuiescencePort,
} from '@cimi/kernel'
import { assertAuthorization, type AuthorizationLevel } from '@cimi/guard'
import { api } from './orpc.ts'
import { createHello } from './resources/hello/index.ts'
import {
  createInstallation,
  type DataDirectoryReadiness,
  type UpgradeExecutor,
} from './resources/installation/index.ts'
import { createInvitation } from './resources/invitation/index.ts'
import { createMembership } from './resources/membership/index.ts'
import { createOrganization } from './resources/organization/index.ts'
import { createRetentionPolicy } from './resources/retention-policy/index.ts'
import { createCollectionPolicy } from './resources/collection-policy/index.ts'
import { createSite, createSiteLifecycleWorker } from './resources/site/index.ts'
import { resolveRequestAdmissionGate, systemHealthHandler, type HealthLifecycle } from './health.ts'
import { normalizeApiError } from './errors.ts'
import {
  combineAcceptanceQuiescence,
  createEventIngestion,
  type IdentitySessionResolver,
  type IngestionProtection,
} from './resources/event-ingestion/index.ts'
import {
  COLLECT_EVENT_MAX_RAW_REQUEST_BYTES,
  COLLECT_EVENTS_MAX_RAW_REQUEST_BYTES,
} from '@cimi/contract'
import {
  createBackupRestore,
  type BackupRestoreCleanupPort,
  type BackupRestoreHealthSnapshot,
} from './resources/backup-restore/index.ts'

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
  lock?: LifecycleLock | undefined
  journal?: AcceptanceJournalPort | undefined
  acceptance?: AcceptanceQuiescencePort | undefined
  reads?: ReadQuiescencePort | undefined
  cleanup?: BackupRestoreCleanupPort | undefined
  dataDirectoryReady: DataDirectoryReadiness
  controlDatabasePath: string
  dataDirectoryPath: string
  upgradeExecutor?: UpgradeExecutor | undefined
  eventIngestionProtection?: IngestionProtection | undefined
  eventIdentitySession?: IdentitySessionResolver | undefined
}

export type ApiApp = Hono & { close(): Promise<void> }

const defaultLifecycleLocks = new WeakMap<Db, LifecycleLock>()

export function createApiApp(deps: CreateApiAppDependencies): ApiApp {
  const hello = createHello({ db: deps.db })
  const authority = createOrganizationAuthority(deps.auth)
  const membership = createMembership({ db: deps.db, authority })
  const organization = createOrganization({
    db: deps.db,
    authority,
    membership: membership.service,
  })
  const lock = deps.lock ?? getLifecycleLock(deps.db)
  const installation = createInstallation({
    db: deps.db,
    analytics: deps.analytics,
    lock,
    ...(deps.journal === undefined ? {} : { journal: deps.journal }),
    dataDirectoryReady: deps.dataDirectoryReady,
    controlDatabasePath: deps.controlDatabasePath,
    dataDirectoryPath: deps.dataDirectoryPath,
    ...(deps.upgradeExecutor === undefined ? {} : { upgradeExecutor: deps.upgradeExecutor }),
  })
  const site = createSite({
    db: deps.db,
    lock,
    lifecycle: installation.service,
    membership: membership.service,
  })
  const siteLifecycleWorker = createSiteLifecycleWorker({ db: deps.db, lock })
  siteLifecycleWorker.start()
  const installationStartup = installation.service.resumeOnStartup().catch(() => undefined)
  const invitation = createInvitation({ db: deps.db, authority, membership: membership.service })
  const retentionPolicy = createRetentionPolicy({
    db: deps.db,
    lock,
    lifecycle: installation.service,
  })
  const collectionPolicy = createCollectionPolicy({
    db: deps.db,
    lock,
    lifecycle: installation.service,
  })
  const eventIngestion = createEventIngestion({
    db: deps.db,
    collectionPolicy: collectionPolicy.service,
    retention: retentionPolicy.repository,
    lifecycleLock: lock,
    protection: deps.eventIngestionProtection,
    identitySession: deps.eventIdentitySession,
  })
  retentionPolicy.worker.start()
  const backupRestore = createBackupRestore({
    db: deps.db,
    analytics: deps.analytics,
    lock,
    acceptance:
      deps.acceptance === undefined
        ? eventIngestion.coalescer
        : combineAcceptanceQuiescence(eventIngestion.coalescer, deps.acceptance),
    ...(deps.reads === undefined ? {} : { reads: deps.reads }),
    ...(deps.cleanup === undefined ? {} : { cleanup: deps.cleanup }),
    dataDirectoryReady: deps.dataDirectoryReady,
    controlDatabasePath: deps.controlDatabasePath,
    dataDirectoryPath: deps.dataDirectoryPath,
  })
  const backupRestoreStartup = installationStartup
    .then(() => backupRestore.service.start())
    .catch(() => undefined)
  backupRestore.worker.start()
  const lifecycle: HealthLifecycle = {
    async getSnapshot() {
      const installationSnapshot = deps.lifecycle
        ? await deps.lifecycle.getSnapshot()
        : ((await installation.service.snapshotForHealth()) ?? {})
      const backupSnapshot: BackupRestoreHealthSnapshot = await backupRestore.service
        .getSnapshot()
        .catch(() => ({ admissionMode: 'normal' }))
      const existingAdmissionMode =
        'admissionMode' in installationSnapshot ? installationSnapshot.admissionMode : undefined
      const admissionMode =
        backupSnapshot.admissionMode === 'normal'
          ? existingAdmissionMode
          : backupSnapshot.admissionMode
      return {
        ...installationSnapshot,
        ...(admissionMode === undefined ? {} : { admissionMode }),
      }
    },
  }
  const router = api.router({
    health: {
      health: api.health.health.handler(async () => systemHealthHandler({ ...deps, lifecycle })),
    },
    hello: hello.router,
    installation: installation.router,
    organization: organization.router,
    membership: membership.router,
    retentionPolicy: retentionPolicy.router,
    collectionPolicy: collectionPolicy.router,
    site: site.router,
    invitation: invitation.router,
    backupRestore: backupRestore.router,
    eventIngestion: eventIngestion.router,
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

  let closed = false
  return Object.assign(app, {
    async close(): Promise<void> {
      if (closed) return
      closed = true
      await retentionPolicy.worker.stop()
      await eventIngestion.service.stop()
      await siteLifecycleWorker.stop()
      await backupRestoreStartup
      await backupRestore.worker.stop()
      await backupRestore.service.stop()
      await installation.service.stop()
    },
  })
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
    return hasParsedPayloadSizeViolation(value)
  } catch {
    return false
  }
}

function hasParsedPayloadSizeViolation(value: unknown): boolean {
  if (!isRecord(value)) return false
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'properties' && isRecord(entry)) {
      if (Object.keys(entry).length > 64) return true
      if (Object.keys(entry).some((propertyKey) => propertyKey.length > 64)) return true
      if (
        Object.values(entry).some(
          (propertyValue) => typeof propertyValue === 'string' && propertyValue.length > 512,
        )
      )
        return true
      continue
    }
    if (
      typeof entry === 'string' &&
      (key === 'pagePath' || key === 'referrer' ? entry.length > 2048 : entry.length > 512)
    )
      return true
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function eventRawRequestLimit(request: Request): number | undefined {
  const path = new URL(request.url).pathname.replace(/^\/api/, '').replace(/\/+$/, '')
  if (request.method !== 'POST') return undefined
  if (path === '/event-ingestion/collectEvent') return COLLECT_EVENT_MAX_RAW_REQUEST_BYTES
  if (path === '/event-ingestion/collectEvents') return COLLECT_EVENTS_MAX_RAW_REQUEST_BYTES
  return undefined
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

function getLifecycleLock(db: Db): LifecycleLock {
  const existing = defaultLifecycleLocks.get(db)
  if (existing !== undefined) return existing
  const lock = new InMemoryLifecycleLock()
  defaultLifecycleLocks.set(db, lock)
  return lock
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
