import { createOrganizationAuthority, type Auth } from '@cimi/auth'
import { DuckDbPublicDashboardQuery, type AnalyticsDb, type Db } from '@cimi/db'
import { reportLogEvent } from '@cimi/logging'
import type { LoggingConfig } from '@cimi/logging'
import {
  InMemoryLifecycleLock,
  type AcceptanceJournalPort,
  type AcceptanceQuiescencePort,
  type LifecycleLock,
  type ReadQuiescencePort,
} from '@cimi/kernel'
import { api } from './orpc.ts'
import { systemHealthHandler, type HealthLifecycle } from './health.ts'
import { createShutdownCoordinator } from './lifecycle/shutdown-coordinator.ts'
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
import { CollectionPolicyReportingProfileFilter } from './resources/collection-policy/reporting-profile-filter.ts'
import { createSite, createSiteLifecycleWorker } from './resources/site/index.ts'
import {
  createEventIngestion,
  InMemoryIngestionProtection,
  AcceptanceBackupRestoreCleanup,
  AcceptanceRetentionCleanup,
  createIdentityProjectionDebt,
  type IdentitySessionResolver,
  type IngestionProtection,
} from './resources/event-ingestion/index.ts'
import type { RetentionCleanupPort } from './resources/retention-policy/index.ts'
import {
  createBackupRestore,
  type BackupRestoreCleanupPort,
  type BackupRestoreHealthSnapshot,
  type BackupRestoreExecutor,
} from './resources/backup-restore/index.ts'
import { createIdentityProfile } from './resources/identity-profile/index.ts'
import { createTrafficReport } from './resources/traffic-report/index.ts'
import { createGoal } from './resources/goal/index.ts'
import { createFunnel } from './resources/funnel/index.ts'
import { createCohort } from './resources/cohort-retention/index.ts'
import { createReportQueryKernelFromInfrastructure } from './resources/reporting/index.ts'
import { createEventReport } from './resources/event-report/index.ts'
import { createPublicDashboard } from './resources/public-dashboard/index.ts'

export interface CreateApiAppDependencies {
  db: Db
  auth: Auth
  analytics: AnalyticsDb
  logging?: LoggingConfig | undefined
  baseUrl?: string | undefined
  lifecycle?: HealthLifecycle | undefined
  lock?: LifecycleLock | undefined
  journal?: AcceptanceJournalPort | undefined
  acceptance?: AcceptanceQuiescencePort | undefined
  reads?: ReadQuiescencePort | undefined
  cleanup?: BackupRestoreCleanupPort | undefined
  wrapBackupRestoreCleanup?:
    | ((cleanup: BackupRestoreCleanupPort) => BackupRestoreCleanupPort)
    | undefined
  dataDirectoryReady: DataDirectoryReadiness
  controlDatabasePath: string
  dataDirectoryPath: string
  migrationsFolder?: string | undefined
  upgradeExecutor?: UpgradeExecutor | undefined
  backupRestoreExecutor?: BackupRestoreExecutor | undefined
  eventIngestionProtection?: IngestionProtection | undefined
  eventIngestionProtectionThresholds?:
    | {
        siteRatePerSecond?: number
        siteBurst?: number
        sourceIpRatePerSecond?: number
        sourceIpBurst?: number
      }
    | undefined
  eventIngestionTrustProxyHeaders?: boolean | undefined
  eventIngestionCountryResolver?: ((headers: Headers) => string | undefined) | undefined
  eventIdentitySession?: IdentitySessionResolver | undefined
  startRetentionCleanupWorker?: boolean | undefined
  retentionCleanupIntervalMs?: number | undefined
  wrapRetentionCleanup?: ((cleanup: RetentionCleanupPort) => RetentionCleanupPort) | undefined
}

export interface ApiComposition {
  readonly router: ApiRouter
  readonly lifecycle: HealthLifecycle
  /** Resolves after startup barriers settle, not after a long-running recovery reaches terminal state. */
  readonly ready: Promise<void>
  close(): Promise<void>
}

type ApiRouterParts = {
  deps: CreateApiAppDependencies
  lifecycle: HealthLifecycle
  hello: ReturnType<typeof createHello>
  installation: ReturnType<typeof createInstallation>
  organization: ReturnType<typeof createOrganization>
  membership: ReturnType<typeof createMembership>
  retentionPolicy: ReturnType<typeof createRetentionPolicy>
  collectionPolicy: ReturnType<typeof createCollectionPolicy>
  site: ReturnType<typeof createSite>
  invitation: ReturnType<typeof createInvitation>
  backupRestore: ReturnType<typeof createBackupRestore>
  eventIngestion: ReturnType<typeof createEventIngestion>
  identityProfile: ReturnType<typeof createIdentityProfile>
  goal: ReturnType<typeof createGoal>
  funnel: ReturnType<typeof createFunnel>
  cohort: ReturnType<typeof createCohort>
  trafficReport: ReturnType<typeof createTrafficReport>
  eventReport: ReturnType<typeof createEventReport>
  publicDashboard: ReturnType<typeof createPublicDashboard>
}

export type ApiRouter = ReturnType<typeof createApiRouter>

const defaultLifecycleLocks = new WeakMap<Db, LifecycleLock>()

export function createApiComposition(deps: CreateApiAppDependencies): ApiComposition {
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
    ...(deps.migrationsFolder === undefined ? {} : { migrationsFolder: deps.migrationsFolder }),
    ...(deps.upgradeExecutor === undefined ? {} : { upgradeExecutor: deps.upgradeExecutor }),
  })
  const site = createSite({
    db: deps.db,
    lock,
    lifecycle: installation.service,
    membership: membership.service,
  })
  const siteLifecycleWorker = createSiteLifecycleWorker({
    db: deps.db,
    lock,
    onPurgedSite: ({ siteId }) => deps.analytics.purgeSite({ siteId }),
  })
  const invitation = createInvitation({ db: deps.db, authority, membership: membership.service })
  const retentionPolicy = createRetentionPolicy({
    db: deps.db,
    lock,
    lifecycle: installation.service,
    ...(deps.retentionCleanupIntervalMs === undefined
      ? {}
      : { intervalMs: deps.retentionCleanupIntervalMs }),
  })
  const collectionPolicy = createCollectionPolicy({
    db: deps.db,
    lock,
    lifecycle: installation.service,
  })
  const eventIngestionProtection =
    deps.eventIngestionProtection ??
    new InMemoryIngestionProtection(deps.eventIngestionProtectionThresholds)
  const identityProjectionDebt = createIdentityProjectionDebt({ db: deps.db })
  const eventIngestion = createEventIngestion({
    db: deps.db,
    collectionPolicy: collectionPolicy.service,
    retention: retentionPolicy.repository,
    lifecycleLock: lock,
    protection: eventIngestionProtection,
    identitySession: deps.eventIdentitySession,
    router: {
      trustProxyHeaders: deps.eventIngestionTrustProxyHeaders,
      countryResolver: deps.eventIngestionCountryResolver,
    },
  })
  const identityProfile = createIdentityProfile({
    db: deps.db,
    collectionPolicy: collectionPolicy.service,
    membership: membership.service,
    protection: eventIngestionProtection,
    projectionDebt: identityProjectionDebt,
    lifecycleLock: lock,
    router: {
      trustProxyHeaders: deps.eventIngestionTrustProxyHeaders,
      countryResolver: deps.eventIngestionCountryResolver,
    },
  })
  const upgradeAcceptance =
    deps.acceptance === undefined
      ? eventIngestion.coalescer
      : combineAcceptanceQuiescence(eventIngestion.coalescer, deps.acceptance)
  installation.service.setAcceptanceQuiescence(upgradeAcceptance)
  const retentionCleanup = new AcceptanceRetentionCleanup({
    acceptance: eventIngestion.acceptanceRepository,
    analytics: deps.analytics,
    db: deps.db,
    dataDirectoryPath: deps.dataDirectoryPath,
    identityDebt: identityProjectionDebt,
  })
  retentionPolicy.worker.setCleanupPort(
    deps.wrapRetentionCleanup?.(retentionCleanup) ?? retentionCleanup,
  )
  let retentionCleanupStartup = Promise.resolve()
  const backupRestore = createBackupRestore({
    db: deps.db,
    analytics: deps.analytics,
    lock,
    acceptance: upgradeAcceptance,
    ...(deps.reads === undefined ? {} : { reads: deps.reads }),
    ...(deps.backupRestoreExecutor === undefined ? {} : { executor: deps.backupRestoreExecutor }),
    cleanup: deps.cleanup ?? createBackupRestoreCleanup(deps, eventIngestion.acceptanceRepository),
    dataDirectoryReady: deps.dataDirectoryReady,
    controlDatabasePath: deps.controlDatabasePath,
    dataDirectoryPath: deps.dataDirectoryPath,
    ...(deps.migrationsFolder === undefined ? {} : { migrationsFolder: deps.migrationsFolder }),
  })
  const lifecycle: HealthLifecycle = {
    async getSnapshot() {
      const installationSnapshot = deps.lifecycle
        ? await deps.lifecycle.getSnapshot()
        : ((await installation.service.snapshotForHealth()) ?? {})
      const backupSnapshot: BackupRestoreHealthSnapshot = await backupRestore.service
        .getSnapshot()
        .catch((error: unknown) => {
          reportLogEvent({
            kind: 'health.failure',
            operation: 'backup-snapshot',
            stage: 'snapshot',
            error,
          })
          return { admissionMode: 'normal' }
        })
      const existingAdmissionMode =
        'admissionMode' in installationSnapshot ? installationSnapshot.admissionMode : undefined
      const admissionMode =
        backupSnapshot.admissionMode === 'normal'
          ? existingAdmissionMode
          : backupSnapshot.admissionMode
      return {
        ...installationSnapshot,
        ...(admissionMode === undefined ? {} : { admissionMode }),
        ingestion: eventIngestion.service.diagnostics,
      }
    },
  }
  const reportingProfileFilter = new CollectionPolicyReportingProfileFilter({
    collectionPolicy: collectionPolicy.service,
  })
  const trafficReport = createTrafficReport({
    db: deps.db,
    analytics: deps.analytics,
    lifecycle,
    dataDirectoryReady: deps.dataDirectoryReady,
    profileFilterKeys: reportingProfileFilter,
  })
  const eventReport = createEventReport({
    db: deps.db,
    analytics: deps.analytics,
    lifecycle,
    dataDirectoryReady: deps.dataDirectoryReady,
    profileFilterKeys: reportingProfileFilter,
  })
  const publicDashboardQuery = new DuckDbPublicDashboardQuery({ analytics: deps.analytics })
  const publicDashboard = createPublicDashboard({
    db: deps.db,
    lock,
    admission: trafficReport.admission,
    query: publicDashboardQuery,
  })
  const reportQuery = createReportQueryKernelFromInfrastructure({
    db: deps.db,
    analytics: deps.analytics,
    admission: trafficReport.admission,
    lifecycleLock: lock,
  })
  const goal = createGoal({
    db: deps.db,
    analytics: deps.analytics,
    admission: trafficReport.admission,
    lifecycleLock: lock,
    query: reportQuery,
  })
  const funnel = createFunnel({
    db: deps.db,
    analytics: deps.analytics,
    admission: trafficReport.admission,
    lifecycleLock: lock,
    query: reportQuery,
  })
  const cohort = createCohort({
    db: deps.db,
    analytics: deps.analytics,
    admission: trafficReport.admission,
    lifecycleLock: lock,
    query: reportQuery,
  })
  const router = createApiRouter({
    deps,
    lifecycle,
    hello,
    installation,
    organization,
    membership,
    retentionPolicy,
    collectionPolicy,
    site,
    invitation,
    backupRestore,
    eventIngestion,
    identityProfile,
    goal,
    funnel,
    cohort,
    trafficReport,
    eventReport,
    publicDashboard,
  })
  siteLifecycleWorker.start()
  const siteLifecycleStartup = siteLifecycleWorker.runOnce()
  const installationStartup = installation.service.resumeOnStartup().catch((error: unknown) => {
    reportLogEvent({ kind: 'operation.failure', operation: 'api.startup', stage: 'startup', error })
    return undefined
  })
  if (deps.startRetentionCleanupWorker !== false) {
    retentionPolicy.worker.start()
    retentionCleanupStartup = retentionPolicy.worker.runOnce()
  }
  const backupRestoreStartup = installationStartup
    .then(() => backupRestore.service.start())
    .catch((error: unknown) => {
      reportLogEvent({
        kind: 'operation.failure',
        operation: 'api.startup',
        stage: 'startup',
        error,
      })
      return undefined
    })
  backupRestore.worker.start()
  const backupCleanupStartup = backupRestore.worker.runOnce()
  const startupShutdownBarrier = Promise.allSettled([installationStartup, backupRestoreStartup])
  const ready = Promise.all([
    siteLifecycleStartup,
    installationStartup,
    retentionCleanupStartup,
    backupRestoreStartup,
    backupCleanupStartup,
  ]).then(() => undefined)
  void ready.catch(() => undefined)
  const shutdown = createShutdownCoordinator([
    {
      label: 'retention cleanup worker',
      close: () => retentionPolicy.worker.stop(),
    },
    {
      label: 'event ingestion service',
      close: () => eventIngestion.service.stop(),
    },
    {
      label: 'site lifecycle worker',
      close: () => siteLifecycleWorker.stop(),
    },
    {
      label: 'startup barriers',
      close: () => startupShutdownBarrier.then(() => undefined),
    },
    {
      label: 'backup restore cleanup worker',
      close: () => backupRestore.worker.stop(),
    },
    {
      label: 'backup restore service',
      close: () => backupRestore.service.stop(),
    },
    {
      label: 'installation service',
      close: () => installation.service.stop(),
    },
  ])

  return {
    router,
    lifecycle,
    ready,
    close: () => shutdown.close(),
  }
}

function createBackupRestoreCleanup(
  deps: CreateApiAppDependencies,
  acceptance: ConstructorParameters<typeof AcceptanceBackupRestoreCleanup>[0]['acceptance'],
): BackupRestoreCleanupPort {
  const cleanup = new AcceptanceBackupRestoreCleanup({
    acceptance,
    analytics: deps.analytics,
    db: deps.db,
    dataDirectoryPath: deps.dataDirectoryPath,
  })
  return deps.wrapBackupRestoreCleanup?.(cleanup) ?? cleanup
}

function createApiRouter(parts: ApiRouterParts) {
  return api.router({
    health: {
      health: api.health.health.handler(async () =>
        systemHealthHandler({ ...parts.deps, lifecycle: parts.lifecycle }),
      ),
    },
    hello: parts.hello.router,
    installation: parts.installation.router,
    organization: parts.organization.router,
    membership: parts.membership.router,
    retentionPolicy: parts.retentionPolicy.router,
    collectionPolicy: parts.collectionPolicy.router,
    site: parts.site.router,
    invitation: parts.invitation.router,
    backupRestore: parts.backupRestore.router,
    eventIngestion: parts.eventIngestion.router,
    identityProfile: parts.identityProfile.router,
    goal: parts.goal.router,
    funnel: parts.funnel.router,
    cohortRetention: parts.cohort.router,
    trafficReport: parts.trafficReport.router,
    eventReport: parts.eventReport.router,
    publicDashboard: parts.publicDashboard.router,
  })
}

function combineAcceptanceQuiescence(
  primary: AcceptanceQuiescencePort,
  secondary: AcceptanceQuiescencePort,
): AcceptanceQuiescencePort {
  return {
    async stopAdmission() {
      await Promise.all([primary.stopAdmission(), secondary.stopAdmission()])
    },
    async drain() {
      const [first, second] = await Promise.all([primary.drain(), secondary.drain()])
      return { lastSafeSequence: Math.max(first.lastSafeSequence, second.lastSafeSequence) }
    },
    async resumeAdmission() {
      await Promise.all([primary.resumeAdmission(), secondary.resumeAdmission()])
    },
  }
}

function getLifecycleLock(db: Db): LifecycleLock {
  const existing = defaultLifecycleLocks.get(db)
  if (existing !== undefined) return existing
  const lock = new InMemoryLifecycleLock()
  defaultLifecycleLocks.set(db, lock)
  return lock
}
