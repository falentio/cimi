import { call } from '@orpc/server'
import { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'
import type { ApiE2eFixture, E2eUser } from './fixture.ts'

export type InstallationSnapshot = InferOutput<typeof schema.SInstallation>
export type BackupSnapshot = InferOutput<typeof schema.SBackup>

export type AvailableBackup = BackupSnapshot & {
  readonly status: 'available'
  readonly phase: 'ready'
  readonly checkpoint: 'structurally_ready'
  readonly progress: 1
  readonly cleanupPending: false
  readonly readiness: {
    readonly controlStore: 'ready'
    readonly analyticsStore: 'ready'
    readonly structural: 'ready'
  }
  readonly errorCode: null
}

export type FailedBackup = BackupSnapshot & {
  readonly status: 'failed'
  readonly phase: 'failed'
  readonly completedAt: string
  readonly errorCode: NonNullable<BackupSnapshot['errorCode']>
}

export interface BackupTrace {
  readonly initial: BackupSnapshot
  readonly observed: readonly BackupSnapshot[]
  readonly terminal: BackupSnapshot
}

const CHECKPOINT_RANK: Record<BackupSnapshot['checkpoint'], number> = {
  none: 0,
  sqlite_captured: 1,
  sqlite_restored: 2,
  duckdb_rebuilt: 3,
  structurally_ready: 4,
}

export async function waitForInstallationTerminal(
  fixture: ApiE2eFixture,
  admin: E2eUser,
  expected: 'ready' | 'degraded',
): Promise<InstallationSnapshot> {
  return fixture.waitFor({
    read: async () =>
      call(
        fixture.router.installation.getInstallationStatus,
        {},
        { context: await admin.context() },
      ),
    done: (value) => value.status === expected,
    label: `installation ${expected}`,
  })
}

export async function waitForBackupTrace(
  fixture: ApiE2eFixture,
  admin: E2eUser,
  backupId: string,
): Promise<BackupTrace> {
  const read = async () =>
    call(
      fixture.router.backupRestore.getBackupStatus,
      { backupId },
      { context: await admin.context() },
    )
  const initial = await read()
  const observed: BackupSnapshot[] = [initial]
  const terminal = await fixture.waitFor({
    read: async () => {
      const value = await read()
      observed.push(value)
      return value
    },
    done: (value) =>
      value.status === 'failed' ||
      (value.status === 'available' && value.phase === 'ready' && !value.cleanupPending),
    operationId: backupId,
    label: `backup or restore ${backupId}`,
  })
  return { initial, observed, terminal }
}

export function assertCheckpointMonotonic(trace: BackupTrace): void {
  let previous = -1
  for (const snapshot of trace.observed) {
    const rank = CHECKPOINT_RANK[snapshot.checkpoint]
    if (rank < previous) {
      throw new Error(`Backup checkpoint regressed for ${snapshot.id}`)
    }
    previous = rank
  }
}

export function assertProgressMonotonic(trace: BackupTrace): void {
  let previous = 0
  for (const snapshot of trace.observed) {
    if (snapshot.progress < previous) {
      throw new Error(`Backup progress regressed for ${snapshot.id}`)
    }
    previous = snapshot.progress
  }
}

export function assertAvailableBackup(
  snapshot: BackupSnapshot,
): asserts snapshot is AvailableBackup {
  if (
    snapshot.status !== 'available' ||
    snapshot.phase !== 'ready' ||
    snapshot.progress !== 1 ||
    snapshot.checkpoint !== 'structurally_ready' ||
    snapshot.cleanupPending ||
    snapshot.errorCode !== null ||
    snapshot.readiness.controlStore !== 'ready' ||
    snapshot.readiness.analyticsStore !== 'ready' ||
    snapshot.readiness.structural !== 'ready'
  ) {
    throw new Error(`Backup ${snapshot.id} did not reach a coherent available state`)
  }
}

export function assertCleanupSettled(snapshot: AvailableBackup): void {
  if (snapshot.cleanupPending) throw new Error(`Backup ${snapshot.id} still has pending cleanup`)
  if (
    !['not_applicable', 'completed'].includes(snapshot.derivedCleanup.status) ||
    !['not_applicable', 'completed'].includes(snapshot.backupCleanup.status)
  ) {
    throw new Error(`Backup ${snapshot.id} has unsettled cleanup stages`)
  }
}

export function assertRestoreSafety(snapshot: AvailableBackup, sourceId: string): void {
  if (
    snapshot.restoreSourceBackupId !== sourceId ||
    snapshot.preRestoreSafetyArtifact?.status !== 'ready' ||
    snapshot.preRestoreSafetyArtifact.errorCode !== null
  ) {
    throw new Error(`Restore ${snapshot.id} has incomplete safety state`)
  }
}

export function isFailedBackup(snapshot: BackupSnapshot): snapshot is FailedBackup {
  return snapshot.status === 'failed'
}
