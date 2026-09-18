import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAuth, type Auth, type AuthUser } from '@cimi/auth/server'
import {
  closeDb,
  createAnalyticsDb,
  createDb,
  migrateControlDb,
  schema,
  type AnalyticsDb,
  type Db,
} from '@cimi/db'
import { eq } from 'drizzle-orm'
import { generateId, isRecord } from '@cimi/utils'
import {
  createApiComposition,
  type ApiComposition,
  type ApiRouter,
  type CreateApiAppDependencies,
} from '../src/composition.ts'
import { createApiHttpApp, type ApiApp } from '../src/http-app.ts'
import { createSerializedOperationQueue } from '../src/lifecycle/operation-queue.ts'
import type { ApiContext } from '../src/orpc.ts'
import { SqliteUpgradeExecutor, type UpgradeExecutor } from '../src/resources/installation/index.ts'
import {
  BackupIncompatibilityError,
  ConfiguredSqliteExecutor,
  InsufficientStorageError as BackupInsufficientStorageError,
  type BackupRestoreCleanupPort,
  type BackupRestoreExecutor,
} from '../src/resources/backup-restore/index.ts'
import {
  InsufficientStorageError as UpgradeInsufficientStorageError,
  UpgradeIncompatibilityError,
} from '../src/resources/installation/upgrade-executor.ts'
import { signUpTestUser } from '../src/testing/fixture.ts'

export interface FileBackedPaths {
  readonly rootDirectory: string
  readonly controlDatabasePath: string
  readonly dataDirectoryPath: string
  readonly analyticsDatabasePath: string
  readonly analyticsTempDirectoryPath: string
}

export type UpgradeStage = 'createSafetyArtifact' | 'migrate' | 'rebuildAnalytics' | 'rollback'

export type BackupStage = 'captureBackup'

export type RestoreStage =
  | 'validateManifest'
  | 'createPreRestoreSafety'
  | 'restoreSqlite'
  | 'migrate'
  | 'rebuildAnalytics'
  | 'verifyStructuralReadiness'
  | 'rollback'

export type CleanupStage = 'derivedCleanup' | 'backupCleanup'

export type FaultPoint =
  | { readonly domain: 'upgrade'; readonly stage: UpgradeStage }
  | { readonly domain: 'backup'; readonly stage: BackupStage }
  | { readonly domain: 'restore'; readonly stage: RestoreStage }
  | { readonly domain: 'cleanup'; readonly stage: CleanupStage }

export type FaultError = 'internal' | 'backupFailed' | 'incompatible' | 'insufficientStorage'

export type FaultAction =
  | { readonly kind: 'throw'; readonly error: FaultError; readonly once?: boolean }
  | { readonly kind: 'hold'; readonly name?: string }

export interface FaultGate {
  readonly entered: Promise<void>
  release(): void
}

export interface FaultController {
  failNext(point: FaultPoint, action: Extract<FaultAction, { readonly kind: 'throw' }>): void
  hold(point: FaultPoint, name?: string): FaultGate
  clear(point: FaultPoint): void
}

export interface PollOptions<T> {
  readonly read: () => Promise<T>
  readonly done: (value: T) => boolean
  readonly timeoutMs?: number
  readonly intervalMs?: number
  readonly operationId?: string
  readonly label?: string
}

export class E2ePollingTimeoutError extends Error {
  readonly operationId: string | undefined
  readonly lastState: unknown

  constructor(input: {
    readonly label: string
    readonly operationId: string | undefined
    readonly lastState: unknown
  }) {
    super(
      `Timed out while waiting for ${input.label}` +
        ` (operationId=${input.operationId ?? 'unknown'}; lastState=${formatState(input.lastState)})`,
    )
    this.name = 'E2ePollingTimeoutError'
    this.operationId = input.operationId
    this.lastState = input.lastState
  }
}

export type ApiE2eRouter = Pick<
  ApiRouter,
  | 'health'
  | 'hello'
  | 'installation'
  | 'backupRestore'
  | 'retentionPolicy'
  | 'collectionPolicy'
  | 'organization'
  | 'site'
  | 'membership'
  | 'invitation'
  | 'eventIngestion'
  | 'identityProfile'
  | 'goal'
  | 'funnel'
  | 'cohortRetention'
  | 'trafficReport'
  | 'eventReport'
>

export interface E2eAnalyticsCapability {
  rebuild(): Promise<void>
}

export interface E2eUser {
  readonly cookie: string
  readonly userId: string
  context(): Promise<ApiContext>
}

export interface InterruptedUpgrade {
  readonly kind: 'upgrade'
  readonly checkpoint: 'none' | 'sqlite_captured' | 'duckdb_rebuilt'
}

export interface InterruptedBackup {
  readonly kind: 'backup'
  readonly checkpoint: 'none' | 'sqlite_captured'
}

export interface InterruptedRestore {
  readonly kind: 'restore'
  readonly sourceBackupId: string
  readonly checkpoint: 'none' | 'sqlite_restored' | 'duckdb_rebuilt'
}

export type InterruptedState = InterruptedUpgrade | InterruptedBackup | InterruptedRestore

export interface FixtureStateTools {
  readonly interruptedOperationId: string
  seedInterrupted(input: InterruptedState): Promise<void>
  appendFutureMigrationHistory(): void
  repairMigrationHistory(): void
  createIncompatibleBackupVariant(input: {
    readonly sourceBackupId: string
  }): Promise<{ readonly backupId: string }>
  createIncompatibleManifestVariant(input: {
    readonly sourceBackupId: string
  }): Promise<{ readonly backupId: string }>
}

export interface DatabaseManagementFixtureOptions {
  readonly timeoutMs?: number
  readonly intervalMs?: number
}

export interface ApiE2eFixture {
  readonly app: ApiApp
  readonly router: ApiE2eRouter
  readonly paths: FileBackedPaths
  readonly rootDirectory: string
  readonly controlDatabasePath: string
  readonly dataDirectoryPath: string
  readonly generation: number
  readonly ready: Promise<void>
  readonly faults: FaultController
  readonly state: FixtureStateTools
  readonly analytics: E2eAnalyticsCapability
  createUser(email: string, name: string): Promise<E2eUser>
  unauthenticatedContext(): ApiContext
  waitFor<T>(options: PollOptions<T>): Promise<T>
  waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T>
  stop(): Promise<void>
  restart(): Promise<void>
  close(): Promise<void>
  [Symbol.asyncDispose](): Promise<void>
}

interface FixtureGeneration {
  readonly number: number
  readonly db: Db
  readonly analytics: AnalyticsDb
  readonly auth: Auth
  readonly composition: ApiComposition
  readonly app: ApiApp
  readonly faultGeneration: number
  readonly ownership: GenerationOwnership
}

interface GenerationOwnership {
  composition: ApiComposition | undefined
  analytics: AnalyticsDb | undefined
  db: Db | undefined
}

interface StoredArtifact {
  readonly id: string
  readonly storageKey: string
  readonly sizeBytes: number
  readonly checksumValue: string
}

interface InternalFaultAction {
  readonly kind: 'throw'
  readonly error: FaultError
  readonly once: boolean
}

interface InternalHoldAction {
  readonly kind: 'hold'
  readonly generation: number
  readonly entered: () => void
  readonly outcome: Promise<GateOutcome>
  cancel(reason: Error): void
}

type InternalFault = InternalFaultAction | InternalHoldAction

type GateOutcome =
  | { readonly kind: 'released' }
  | { readonly kind: 'cancelled'; readonly reason: Error }

interface ActiveGate {
  readonly generation: number
  readonly action: InternalHoldAction
  readonly settled: Promise<void>
  settle(): void
}

const FUTURE_MIGRATION_MARKER = 'cimi-e2e-future-migration'
export async function createApiE2eFixture(
  options: DatabaseManagementFixtureOptions = {},
): Promise<ApiE2eFixture> {
  const defaultTimeoutMs = options.timeoutMs ?? 30_000
  const defaultIntervalMs = options.intervalMs ?? 50
  const rootDirectory = await mkdtemp(join(tmpdir(), 'cimi-api-e2e-'))
  const paths: FileBackedPaths = {
    rootDirectory,
    controlDatabasePath: join(rootDirectory, 'control.sqlite'),
    dataDirectoryPath: join(rootDirectory, 'data'),
    analyticsDatabasePath: join(rootDirectory, 'data', 'analytics.duckdb'),
    analyticsTempDirectoryPath: join(rootDirectory, 'data', 'analytics-temp'),
  }
  await mkdir(paths.dataDirectoryPath, { recursive: true })
  const faults = new E2eFaultController()

  let current: FixtureGeneration | undefined
  let generationNumber = 0
  let interruptedOperationId: string | undefined
  const lifecycleQueue = createSerializedOperationQueue()
  let closePromise: Promise<void> | undefined
  let closing = false
  let closed = false
  let futureMigrationCreatedAt: number | undefined

  const open = async (removeRootOnFailure: boolean): Promise<FixtureGeneration> => {
    const faultGeneration = faults.beginGeneration()
    const ownership: GenerationOwnership = {
      composition: undefined,
      analytics: undefined,
      db: undefined,
    }
    try {
      const openedDb = createDb({ path: paths.controlDatabasePath })
      ownership.db = openedDb
      migrateControlDb(openedDb)
      const openedAnalytics = await createAnalyticsDb({
        path: paths.analyticsDatabasePath,
        tempDirectory: paths.analyticsTempDirectoryPath,
      })
      ownership.analytics = openedAnalytics
      const auth = createAuth({
        db: openedDb,
        schema: schema.betterAuthSchema,
        secret: 'test-secret-1234567890',
        baseURL: 'http://localhost',
      })
      const realUpgradeExecutor = new SqliteUpgradeExecutor({
        db: openedDb,
        controlDatabasePath: paths.controlDatabasePath,
        dataDirectoryPath: paths.dataDirectoryPath,
        analyticsRebuild: () => openedAnalytics.rebuild({ controlDb: openedDb }),
      })
      const realBackupRestoreExecutor = new ConfiguredSqliteExecutor({
        db: openedDb,
        analytics: openedAnalytics,
        controlDatabasePath: paths.controlDatabasePath,
        dataDirectoryPath: paths.dataDirectoryPath,
      })
      const deps: CreateApiAppDependencies = {
        db: openedDb,
        auth,
        analytics: openedAnalytics,
        baseUrl: 'http://localhost',
        dataDirectoryReady: () => existsSync(paths.dataDirectoryPath),
        controlDatabasePath: paths.controlDatabasePath,
        dataDirectoryPath: paths.dataDirectoryPath,
        startRetentionCleanupWorker: false,
        upgradeExecutor: new FaultingUpgradeExecutor(realUpgradeExecutor, faults, faultGeneration),
        backupRestoreExecutor: new FaultingBackupRestoreExecutor(
          realBackupRestoreExecutor,
          faults,
          faultGeneration,
        ),
        wrapBackupRestoreCleanup: (cleanup) =>
          new FaultingCleanup(cleanup, faults, faultGeneration),
      }
      const composition = createApiComposition(deps)
      ownership.composition = composition
      const app = createApiHttpApp(deps, composition)
      await composition.ready
      generationNumber += 1
      return {
        number: generationNumber,
        db: openedDb,
        analytics: openedAnalytics,
        auth,
        composition,
        app,
        faultGeneration,
        ownership,
      }
    } catch (error) {
      let cleanupError: unknown
      try {
        await faults.cancelHeldGates(faultGeneration)
        await closeGeneration(ownership)
      } catch (closeError) {
        cleanupError = closeError
      }
      if (cleanupError === undefined && removeRootOnFailure) {
        try {
          await rm(rootDirectory, { recursive: true, force: true })
        } catch (rootError) {
          cleanupError = rootError
        }
      }
      throw constructionFailure(error, cleanupError)
    }
  }

  const requireGeneration = (): FixtureGeneration => {
    if (current === undefined) throw new Error('The E2E fixture is stopped')
    return current
  }

  const requireOpenForMutation = (): FixtureGeneration => {
    if (closed || closing) throw new Error('The E2E fixture is closed')
    return requireGeneration()
  }

  const stop = async (): Promise<void> => {
    return lifecycleQueue.run(async () => {
      requireOpenForMutation()
      const generation = current
      if (generation === undefined) return
      await drainGeneration(generation)
      current = undefined
    })
  }

  const restart = async (): Promise<void> => {
    return lifecycleQueue.run(async () => {
      if (closed || closing) throw new Error('The E2E fixture is closed')
      if (current !== undefined) {
        await drainGeneration(current)
        current = undefined
      }
      current = await open(false)
    })
  }

  const close = (): Promise<void> => {
    if (closePromise !== undefined) return closePromise
    const pending = lifecycleQueue.run(async () => {
      if (closed) return
      closing = true
      try {
        if (current !== undefined) {
          await drainGeneration(current)
          current = undefined
        }
        await faults.cancelHeldGates(faults.currentGeneration())
        await rm(rootDirectory, { recursive: true, force: true })
        closed = true
      } finally {
        closing = false
      }
    })
    closePromise = pending.catch((error: unknown) => {
      closePromise = undefined
      throw error
    })
    return closePromise
  }

  async function drainGeneration(generation: FixtureGeneration): Promise<void> {
    await faults.cancelHeldGates(generation.faultGeneration)
    await closeGeneration(generation.ownership)
  }

  const waitFor = async <T>(
    optionsOrRead: PollOptions<T> | (() => Promise<T>),
    done?: (value: T) => boolean,
  ): Promise<T> => {
    const options: PollOptions<T> =
      typeof optionsOrRead === 'function'
        ? { read: optionsOrRead, done: done ?? (() => false) }
        : optionsOrRead
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs
    const intervalMs = options.intervalMs ?? defaultIntervalMs
    const deadline = Date.now() + timeoutMs
    let value = await options.read()
    while (!options.done(value)) {
      if (Date.now() >= deadline) {
        throw new E2ePollingTimeoutError({
          label: options.label ?? 'an E2E operation',
          operationId: options.operationId ?? operationIdOf(value),
          lastState: value,
        })
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
      value = await options.read()
    }
    return value
  }

  const state: FixtureStateTools = {
    get interruptedOperationId() {
      if (interruptedOperationId === undefined)
        throw new Error('No interrupted operation is seeded')
      return interruptedOperationId
    },
    async seedInterrupted(input) {
      if (current !== undefined) throw new Error('seedInterrupted requires a stopped fixture')
      if (closed || closing) throw new Error('The E2E fixture is closed')
      const operationId = generateId('bop')
      await withStateDb(async (db) => {
        const installation = db.select().from(schema.TInstallation).limit(1).all()[0]
        if (installation === undefined)
          throw new Error('Initialize the installation before seeding recovery')
        if (installation.activeOperationId !== null) {
          throw new Error('Cannot seed recovery over an active installation operation')
        }
        const now = new Date()
        const artifact =
          input.kind === 'upgrade' && input.checkpoint !== 'none'
            ? await captureArtifact(db, paths, {
                operationId,
                kind: 'authoritative_sqlite',
              })
            : input.kind === 'backup' && input.checkpoint !== 'none'
              ? await captureArtifact(db, paths, {
                  operationId,
                  kind: 'authoritative_sqlite',
                })
              : input.kind === 'restore' && input.checkpoint !== 'none'
                ? await captureArtifact(db, paths, {
                    operationId,
                    kind: 'pre_restore_sqlite',
                  })
                : undefined
        if (input.kind === 'restore') {
          const source = db
            .select({ id: schema.TBackupOperation.id })
            .from(schema.TBackupOperation)
            .where(eq(schema.TBackupOperation.id, input.sourceBackupId))
            .limit(1)
            .all()[0]
          if (source === undefined) throw new Error('The restore source backup does not exist')
        }
        const state = interruptedOperationState(input)
        db.transaction((tx) => {
          tx.insert(schema.TBackupOperation)
            .values({
              id: operationId,
              operationType: input.kind,
              status: state.status,
              scope: 'installation',
              phase: state.phase,
              progress: state.progress,
              checkpoint: state.checkpoint,
              lastSafeSequence: null,
              controlReadiness: state.controlReadiness,
              analyticsReadiness: state.analyticsReadiness,
              structuralReadiness: state.structuralReadiness,
              cleanupPending: false,
              errorCode: null,
              recoveryKey: null,
              createdAt: now,
              startedAt: state.startedAt ? now : null,
              completedAt: null,
              updatedAt: now,
              ownerToken: 'e2e-seeded-owner',
            })
            .run()
          tx.insert(schema.TBackupCleanupStage)
            .values({
              operationId,
              stage: 'derived_cleanup',
              status: 'not_applicable',
              startedAt: null,
              completedAt: null,
              errorCode: null,
            })
            .run()
          tx.insert(schema.TBackupCleanupStage)
            .values({
              operationId,
              stage: 'backup_cleanup',
              status: 'not_applicable',
              startedAt: null,
              completedAt: null,
              errorCode: null,
            })
            .run()
          if (artifact !== undefined) {
            tx.insert(schema.TBackupArtifact)
              .values({
                id: artifact.id,
                operationId,
                artifactType: artifact.kind,
                generationId: operationId,
                storageKey: artifact.storageKey,
                schemaVersion: '1',
                retentionBoundary: null,
                acceptanceSequence: null,
                sizeBytes: artifact.sizeBytes,
                checksumAlgorithm: 'sha256',
                checksumValue: artifact.checksumValue,
                metadata: null,
                createdAt: now,
              })
              .run()
          }
          if (input.kind === 'restore') {
            tx.insert(schema.TBackupRestoreReference)
              .values({
                operationId,
                restoreSourceBackupId: input.sourceBackupId,
                preRestoreSafetyArtifactId: artifact?.id ?? null,
                createdAt: now,
              })
              .run()
          }
          tx.update(schema.TInstallation)
            .set({
              status: state.installationStatus,
              activeOperationId: operationId,
              activeOperationKind: input.kind,
              activeOperationPhase: state.installationPhase,
              activeOperationCheckpoint: state.installationCheckpoint,
              activeOperationProgress: state.progress,
              activeOperationOwnerToken: 'e2e-seeded-owner',
              activeOperationLastSafeSequence: null,
              activeOperationErrorCode: null,
              updatedAt: now,
            })
            .where(eq(schema.TInstallation.singletonKey, 'default'))
            .run()
        })
      })
      interruptedOperationId = operationId
    },
    appendFutureMigrationHistory() {
      const db = requireOpenForMutation().db
      const row = db.$client
        .prepare('SELECT MAX(created_at) AS createdAt FROM __drizzle_migrations')
        .get() as { readonly createdAt: number | null } | undefined
      const createdAt = (row?.createdAt ?? Date.now()) + 1
      db.$client
        .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run(FUTURE_MIGRATION_MARKER, createdAt)
      futureMigrationCreatedAt = createdAt
    },
    repairMigrationHistory() {
      const db = requireOpenForMutation().db
      db.$client
        .prepare(
          futureMigrationCreatedAt === undefined
            ? 'DELETE FROM __drizzle_migrations WHERE hash = ?'
            : 'DELETE FROM __drizzle_migrations WHERE hash = ? AND created_at = ?',
        )
        .run(
          ...(futureMigrationCreatedAt === undefined
            ? [FUTURE_MIGRATION_MARKER]
            : [FUTURE_MIGRATION_MARKER, futureMigrationCreatedAt]),
        )
      futureMigrationCreatedAt = undefined
    },
    async createIncompatibleBackupVariant(input) {
      return createBackupVariant(input.sourceBackupId, 'future-history')
    },
    async createIncompatibleManifestVariant(input) {
      return createBackupVariant(input.sourceBackupId, 'manifest')
    },
  }

  current = await open(true)

  async function createBackupVariant(
    sourceBackupId: string,
    variant: 'future-history' | 'manifest',
  ): Promise<{ readonly backupId: string }> {
    const generation = requireOpenForMutation()
    const sourceOperation = generation.db
      .select()
      .from(schema.TBackupOperation)
      .where(eq(schema.TBackupOperation.id, sourceBackupId))
      .limit(1)
      .all()[0]
    const sourceArtifact = generation.db
      .select()
      .from(schema.TBackupArtifact)
      .where(eq(schema.TBackupArtifact.operationId, sourceBackupId))
      .limit(1)
      .all()[0]
    if (
      sourceOperation === undefined ||
      sourceOperation.operationType !== 'backup' ||
      sourceOperation.status !== 'available' ||
      sourceArtifact === undefined ||
      sourceArtifact.artifactType !== 'authoritative_sqlite'
    ) {
      throw new Error('The source backup is not available')
    }
    const backupId = generateId('bop')
    const artifactId = generateId('bar')
    const storageKey = `backups/${backupId}.sqlite`
    const sourcePath = join(paths.dataDirectoryPath, sourceArtifact.storageKey)
    const variantPath = join(paths.dataDirectoryPath, storageKey)
    await mkdir(dirname(variantPath), { recursive: true })
    await copyFile(sourcePath, variantPath)
    if (variant === 'future-history') await appendFutureMigrationToArtifact(variantPath)
    const contents = await readFile(variantPath)
    const now = new Date()
    generation.db.transaction((tx) => {
      tx.insert(schema.TBackupOperation)
        .values({
          id: backupId,
          operationType: 'backup',
          status: 'available',
          scope: 'installation',
          phase: 'ready',
          progress: 1,
          checkpoint: 'structurally_ready',
          lastSafeSequence: sourceOperation.lastSafeSequence,
          controlReadiness: 'ready',
          analyticsReadiness: 'ready',
          structuralReadiness: 'ready',
          cleanupPending: false,
          errorCode: null,
          recoveryKey: null,
          createdAt: now,
          startedAt: now,
          completedAt: now,
          updatedAt: now,
          ownerToken: null,
        })
        .run()
      tx.insert(schema.TBackupCleanupStage)
        .values({
          operationId: backupId,
          stage: 'derived_cleanup',
          status: 'not_applicable',
          startedAt: null,
          completedAt: null,
          errorCode: null,
        })
        .run()
      tx.insert(schema.TBackupCleanupStage)
        .values({
          operationId: backupId,
          stage: 'backup_cleanup',
          status: 'not_applicable',
          startedAt: null,
          completedAt: null,
          errorCode: null,
        })
        .run()
      tx.insert(schema.TBackupArtifact)
        .values({
          id: artifactId,
          operationId: backupId,
          artifactType: 'authoritative_sqlite',
          generationId: backupId,
          storageKey,
          schemaVersion: variant === 'manifest' ? '2' : '1',
          retentionBoundary: sourceArtifact.retentionBoundary,
          acceptanceSequence: sourceArtifact.acceptanceSequence,
          sizeBytes: contents.byteLength,
          checksumAlgorithm: 'sha256',
          checksumValue: createHash('sha256').update(contents).digest('hex'),
          metadata: sourceArtifact.metadata,
          createdAt: now,
        })
        .run()
    })
    return { backupId }
  }

  async function appendFutureMigrationToArtifact(path: string): Promise<void> {
    const db = createDb({ path })
    try {
      const row = db.$client
        .prepare('SELECT MAX(created_at) AS createdAt FROM __drizzle_migrations')
        .get() as { readonly createdAt: number | null } | undefined
      db.$client
        .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run(FUTURE_MIGRATION_MARKER, (row?.createdAt ?? Date.now()) + 1)
    } finally {
      closeDb(db)
    }
  }

  async function withStateDb<T>(callback: (db: Db) => Promise<T>): Promise<T> {
    const db = createDb({ path: paths.controlDatabasePath })
    try {
      return await callback(db)
    } finally {
      closeDb(db)
    }
  }

  const fixture: ApiE2eFixture = {
    get app() {
      return requireGeneration().app
    },
    get router() {
      return requireGeneration().composition.router
    },
    paths,
    rootDirectory,
    controlDatabasePath: paths.controlDatabasePath,
    dataDirectoryPath: paths.dataDirectoryPath,
    get generation() {
      return current?.number ?? generationNumber
    },
    get ready() {
      return requireGeneration().composition.ready
    },
    faults,
    state,
    analytics: {
      async rebuild() {
        const generation = requireOpenForMutation()
        await generation.analytics.rebuild({ controlDb: generation.db })
      },
    },
    async createUser(email, name) {
      const generation = requireGeneration()
      const signedUp = await signUpTestUser(generation.app, email, name)
      return {
        ...signedUp,
        context: () => createUserContext(signedUp.cookie),
      }
    },
    unauthenticatedContext() {
      return { user: undefined, headers: new Headers() }
    },
    waitFor,
    stop,
    restart,
    close,
    [Symbol.asyncDispose]: close,
  }
  return fixture

  async function createUserContext(cookie: string): Promise<ApiContext> {
    const auth = requireGeneration().auth
    const headers = new Headers({ cookie })
    const session = await auth.api.getSession({ headers })
    if (session?.user === undefined) throw new Error('Expected the E2E user session')
    const sessionUser: AuthUser = session.user
    const user: AuthUser = {
      ...sessionUser,
      installationGrant: sessionUser.installationGrant ?? sessionUser.role === 'admin',
    }
    return { user, headers }
  }
}

class E2eFaultController implements FaultController {
  private readonly actions = new Map<string, InternalFault>()
  private readonly activeGates = new Set<ActiveGate>()
  private readonly cancelledGenerations = new Set<number>()
  private generation = 0

  beginGeneration(): number {
    this.generation += 1
    return this.generation
  }

  currentGeneration(): number {
    return this.generation
  }

  failNext(point: FaultPoint, action: Extract<FaultAction, { readonly kind: 'throw' }>): void {
    this.actions.set(keyOf(point), {
      kind: 'throw',
      error: action.error,
      once: action.once ?? true,
    })
  }

  hold(point: FaultPoint, _name?: string): FaultGate {
    let enter: () => void = () => undefined
    let settleOutcome: (outcome: GateOutcome) => void = () => undefined
    let settled = false
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const outcome = new Promise<GateOutcome>((resolve) => {
      settleOutcome = resolve
    })
    const finish = (next: GateOutcome): void => {
      if (settled) return
      settled = true
      settleOutcome(next)
    }
    this.actions.set(keyOf(point), {
      kind: 'hold',
      generation: this.generation,
      entered: enter,
      outcome,
      cancel: (reason) => finish({ kind: 'cancelled', reason }),
    })
    return { entered, release: () => finish({ kind: 'released' }) }
  }

  clear(point: FaultPoint): void {
    this.actions.delete(keyOf(point))
  }

  async before(point: FaultPoint, generation = this.generation): Promise<void> {
    if (this.cancelledGenerations.has(generation)) throw faultGateCancelledError()
    const key = keyOf(point)
    const action = this.actions.get(key)
    if (action === undefined) return
    if (action.kind === 'throw') {
      if (action.once) this.actions.delete(key)
      throw faultError(point, action.error)
    }
    this.actions.delete(key)
    let settleActive: () => void = () => undefined
    const active: ActiveGate = {
      generation,
      action,
      settled: new Promise<void>((resolve) => {
        settleActive = resolve
      }),
      settle: () => settleActive(),
    }
    this.activeGates.add(active)
    action.entered()
    try {
      const result = await action.outcome
      if (result.kind === 'cancelled') throw result.reason
    } finally {
      this.activeGates.delete(active)
      active.settle()
    }
  }

  async cancelHeldGates(generation: number): Promise<void> {
    const reason = faultGateCancelledError()
    this.cancelledGenerations.add(generation)
    for (const [key, action] of this.actions) {
      if (action.kind === 'hold' && action.generation === generation) {
        this.actions.delete(key)
        action.cancel(reason)
      }
    }
    const active = [...this.activeGates].filter((gate) => gate.generation === generation)
    for (const gate of active) gate.action.cancel(reason)
    await Promise.allSettled(active.map((gate) => gate.settled))
  }
}

function faultGateCancelledError(): Error {
  return new Error('E2E fault gate cancelled during fixture teardown')
}

class FaultingUpgradeExecutor implements UpgradeExecutor {
  constructor(
    private readonly real: UpgradeExecutor,
    private readonly faults: E2eFaultController,
    private readonly generation: number,
  ) {}

  async createSafetyArtifact(input: Parameters<UpgradeExecutor['createSafetyArtifact']>[0]) {
    await this.faults.before({ domain: 'upgrade', stage: 'createSafetyArtifact' }, this.generation)
    return this.real.createSafetyArtifact(input)
  }

  async migrate(input: Parameters<UpgradeExecutor['migrate']>[0]) {
    await this.faults.before({ domain: 'upgrade', stage: 'migrate' }, this.generation)
    return this.real.migrate(input)
  }

  async rebuildAnalytics(input: Parameters<UpgradeExecutor['rebuildAnalytics']>[0]) {
    await this.faults.before({ domain: 'upgrade', stage: 'rebuildAnalytics' }, this.generation)
    return this.real.rebuildAnalytics(input)
  }

  async rollback(input: Parameters<UpgradeExecutor['rollback']>[0]) {
    await this.faults.before({ domain: 'upgrade', stage: 'rollback' }, this.generation)
    return this.real.rollback(input)
  }
}

class FaultingBackupRestoreExecutor implements BackupRestoreExecutor {
  constructor(
    private readonly real: BackupRestoreExecutor,
    private readonly faults: E2eFaultController,
    private readonly generation: number,
  ) {}

  async captureBackup(input: Parameters<BackupRestoreExecutor['captureBackup']>[0]) {
    await this.faults.before({ domain: 'backup', stage: 'captureBackup' }, this.generation)
    return this.real.captureBackup(input)
  }

  async createPreRestoreSafety(
    input: Parameters<BackupRestoreExecutor['createPreRestoreSafety']>[0],
  ) {
    await this.faults.before(
      { domain: 'restore', stage: 'createPreRestoreSafety' },
      this.generation,
    )
    return this.real.createPreRestoreSafety(input)
  }

  async validateManifest(input: Parameters<BackupRestoreExecutor['validateManifest']>[0]) {
    await this.faults.before({ domain: 'restore', stage: 'validateManifest' }, this.generation)
    return this.real.validateManifest(input)
  }

  async restoreSqlite(input: Parameters<BackupRestoreExecutor['restoreSqlite']>[0]) {
    await this.faults.before({ domain: 'restore', stage: 'restoreSqlite' }, this.generation)
    return this.real.restoreSqlite(input)
  }

  async migrate(input: Parameters<BackupRestoreExecutor['migrate']>[0]) {
    await this.faults.before({ domain: 'restore', stage: 'migrate' }, this.generation)
    return this.real.migrate(input)
  }

  async rebuildAnalytics(input: Parameters<BackupRestoreExecutor['rebuildAnalytics']>[0]) {
    await this.faults.before({ domain: 'restore', stage: 'rebuildAnalytics' }, this.generation)
    return this.real.rebuildAnalytics(input)
  }

  async verifyStructuralReadiness(
    input: Parameters<BackupRestoreExecutor['verifyStructuralReadiness']>[0],
  ) {
    await this.faults.before(
      { domain: 'restore', stage: 'verifyStructuralReadiness' },
      this.generation,
    )
    return this.real.verifyStructuralReadiness(input)
  }

  async rollback(input: Parameters<BackupRestoreExecutor['rollback']>[0]) {
    await this.faults.before({ domain: 'restore', stage: 'rollback' }, this.generation)
    return this.real.rollback(input)
  }
}

class FaultingCleanup implements BackupRestoreCleanupPort {
  constructor(
    private readonly real: BackupRestoreCleanupPort,
    private readonly faults: E2eFaultController,
    private readonly generation: number,
  ) {}

  async runDerived(input: Parameters<BackupRestoreCleanupPort['runDerived']>[0]) {
    await this.faults.before({ domain: 'cleanup', stage: 'derivedCleanup' }, this.generation)
    return this.real.runDerived(input)
  }

  async runBackup(input: Parameters<BackupRestoreCleanupPort['runBackup']>[0]) {
    await this.faults.before({ domain: 'cleanup', stage: 'backupCleanup' }, this.generation)
    return this.real.runBackup(input)
  }
}

function keyOf(point: FaultPoint): string {
  return `${point.domain}:${point.stage}`
}

function faultError(point: FaultPoint, error: FaultError): Error {
  if (error === 'incompatible' && point.domain === 'upgrade') {
    return new UpgradeIncompatibilityError(`E2E fault at ${keyOf(point)}`)
  }
  if (error === 'incompatible' && point.domain === 'restore') {
    return new BackupIncompatibilityError(`E2E fault at ${keyOf(point)}`)
  }
  if (error === 'insufficientStorage' && point.domain === 'upgrade') {
    return new UpgradeInsufficientStorageError(`E2E fault at ${keyOf(point)}`)
  }
  if (error === 'insufficientStorage' && point.domain === 'restore') {
    return new BackupInsufficientStorageError(`E2E fault at ${keyOf(point)}`)
  }
  return new Error(`E2E fault at ${keyOf(point)}: ${error}`)
}

function interruptedOperationState(input: InterruptedState): {
  readonly status: 'creating' | 'restoring'
  readonly phase: 'capturing_sqlite' | 'restoring_sqlite' | 'rebuilding_duckdb'
  readonly progress: number
  readonly checkpoint: 'none' | 'sqlite_captured' | 'sqlite_restored' | 'duckdb_rebuilt'
  readonly controlReadiness: 'not_ready' | 'ready'
  readonly analyticsReadiness: 'not_ready' | 'ready' | 'rebuilding'
  readonly structuralReadiness: 'not_ready' | 'ready'
  readonly startedAt: boolean
  readonly installationStatus: 'maintenance' | 'recovering'
  readonly installationPhase: 'pre_upgrade_safety' | 'lifecycle_transition'
  readonly installationCheckpoint: 'none' | 'sqlite_captured' | 'duckdb_rebuilt'
} {
  if (input.kind === 'upgrade') {
    const duckdbRebuilt = input.checkpoint === 'duckdb_rebuilt'
    return {
      status: 'creating',
      phase: duckdbRebuilt ? 'rebuilding_duckdb' : 'capturing_sqlite',
      progress: input.checkpoint === 'none' ? 0 : duckdbRebuilt ? 0.9 : 0.5,
      checkpoint: input.checkpoint,
      controlReadiness: 'ready',
      analyticsReadiness: 'ready',
      structuralReadiness: 'not_ready',
      startedAt: input.checkpoint !== 'none',
      installationStatus: 'maintenance',
      installationPhase: 'pre_upgrade_safety',
      installationCheckpoint:
        input.checkpoint === 'duckdb_rebuilt' ? 'duckdb_rebuilt' : input.checkpoint,
    }
  }
  if (input.kind === 'backup') {
    return {
      status: 'creating',
      phase: 'capturing_sqlite',
      progress: input.checkpoint === 'none' ? 0 : 0.9,
      checkpoint: input.checkpoint,
      controlReadiness: 'ready',
      analyticsReadiness: 'ready',
      structuralReadiness: 'not_ready',
      startedAt: input.checkpoint !== 'none',
      installationStatus: 'maintenance',
      installationPhase: 'lifecycle_transition',
      installationCheckpoint: input.checkpoint,
    }
  }
  if (input.checkpoint === 'none') {
    return {
      status: 'creating',
      phase: 'capturing_sqlite',
      progress: 0,
      checkpoint: 'none',
      controlReadiness: 'ready',
      analyticsReadiness: 'ready',
      structuralReadiness: 'not_ready',
      startedAt: false,
      installationStatus: 'recovering',
      installationPhase: 'lifecycle_transition',
      installationCheckpoint: 'none',
    }
  }
  const duckdbRebuilt = input.checkpoint === 'duckdb_rebuilt'
  return {
    status: 'restoring',
    phase: duckdbRebuilt ? 'rebuilding_duckdb' : 'restoring_sqlite',
    progress: duckdbRebuilt ? 0.9 : 0.6,
    checkpoint: input.checkpoint,
    controlReadiness: 'ready',
    analyticsReadiness: duckdbRebuilt ? 'ready' : 'rebuilding',
    structuralReadiness: 'not_ready',
    startedAt: true,
    installationStatus: 'recovering',
    installationPhase: 'lifecycle_transition',
    installationCheckpoint: duckdbRebuilt ? 'duckdb_rebuilt' : 'sqlite_captured',
  }
}

async function captureArtifact(
  db: Db,
  paths: FileBackedPaths,
  input: {
    readonly operationId: string
    readonly kind: 'authoritative_sqlite' | 'pre_restore_sqlite'
  },
): Promise<StoredArtifact & { readonly kind: 'authoritative_sqlite' | 'pre_restore_sqlite' }> {
  const id = generateId('bar')
  const directory = input.kind === 'authoritative_sqlite' ? 'backups' : 'safety'
  const storageKey = `${directory}/${input.operationId}.sqlite`
  const path = join(paths.dataDirectoryPath, storageKey)
  await mkdir(dirname(path), { recursive: true })
  await db.$client.backup(path)
  const contents = await readFile(path)
  const file = await stat(path)
  return {
    kind: input.kind,
    id,
    storageKey,
    sizeBytes: file.size,
    checksumValue: createHash('sha256').update(contents).digest('hex'),
  }
}

async function closeGeneration(input: GenerationOwnership): Promise<void> {
  if (input.composition !== undefined) {
    await input.composition.close()
    input.composition = undefined
  }
  const failures: unknown[] = []
  if (input.analytics !== undefined) {
    try {
      await input.analytics.close()
      input.analytics = undefined
    } catch (error) {
      failures.push(error)
    }
  }
  if (input.db !== undefined) {
    try {
      closeDb(input.db)
      input.db = undefined
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'E2E generation shutdown failed')
}

function constructionFailure(error: unknown, cleanupError: unknown): unknown {
  if (cleanupError === undefined) return error
  return new AggregateError(
    [error, cleanupError],
    'E2E fixture construction and cleanup both failed',
  )
}

function operationIdOf(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value['id'] === 'string') return value['id']
  const activeOperation = value['activeOperation']
  if (isRecord(activeOperation) && typeof activeOperation['operationId'] === 'string') {
    return activeOperation['operationId']
  }
  return undefined
}

function formatState(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
