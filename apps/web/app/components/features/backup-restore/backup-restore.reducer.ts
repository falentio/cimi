import type {
  Backup,
  BackupList,
  BackupRestoreDataAction,
  BackupRestoreDataState,
  BackupId,
} from './backup-restore.types'

const STATUS_RANK: Record<Backup['status'], number> = {
  creating: 0,
  restoring: 1,
  available: 2,
  failed: 3,
}

const RESTORE_STAGE_RANK: Record<Backup['phase'], number> = {
  capturing_sqlite: 0,
  restoring_sqlite: 1,
  rebuilding_duckdb: 2,
  ready: 3,
  cleanup_pending: 4,
  failed: 5,
}

const PHASE_RANK: Record<Backup['phase'], number> = {
  capturing_sqlite: 0,
  restoring_sqlite: 1,
  rebuilding_duckdb: 2,
  ready: 3,
  cleanup_pending: 4,
  failed: 5,
}

const CHECKPOINT_RANK: Record<Backup['checkpoint'], number> = {
  none: 0,
  sqlite_captured: 1,
  sqlite_restored: 2,
  duckdb_rebuilt: 3,
  structurally_ready: 4,
}

const CLEANUP_STATUS_RANK: Record<Backup['derivedCleanup']['status'], number> = {
  not_applicable: 0,
  not_started: 0,
  pending: 1,
  running: 2,
  completed: 3,
  failed: 3,
}

const CONTROL_STORE_RANK: Record<Backup['readiness']['controlStore'], number> = {
  not_ready: 0,
  ready: 1,
}

const ANALYTICS_STORE_RANK: Record<Backup['readiness']['analyticsStore'], number> = {
  not_ready: 0,
  rebuilding: 1,
  ready: 2,
}

const STRUCTURAL_READINESS_RANK: Record<Backup['readiness']['structural'], number> = {
  not_ready: 0,
  ready: 1,
}

export function createInitialBackupRestoreData(): BackupRestoreDataState {
  return {
    order: [],
    records: new Map(),
    totalCount: 0,
    nextOffset: null,
    hasMore: false,
    selectedBackupId: null,
    trackedOperationId: null,
    trackedOperation: null,
  }
}

export function reduceBackupRestoreData(
  state: BackupRestoreDataState,
  action: BackupRestoreDataAction,
): BackupRestoreDataState {
  switch (action.kind) {
    case 'list-replaced':
      return mergePage(state, action.page, false)
    case 'list-appended':
      return mergePage(state, action.page, true)
    case 'operation-received':
      return mergeOperation(state, action.operation)
    case 'operation-cleared':
      if (state.trackedOperationId !== action.operationId) return state
      return {
        ...state,
        trackedOperationId: null,
        trackedOperation: null,
      }
    case 'selection-changed':
      return {
        ...state,
        selectedBackupId:
          action.backupId === null || state.records.has(action.backupId) ? action.backupId : null,
      }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

function mergePage(
  state: BackupRestoreDataState,
  page: BackupList,
  append: boolean,
): BackupRestoreDataState {
  const records = new Map(state.records)
  const pageIds: BackupId[] = []
  for (const backup of page.items) {
    records.set(backup.id, mergeBackupRecord(records.get(backup.id), backup))
    pageIds.push(backup.id)
  }

  const order = append
    ? [...state.order, ...pageIds.filter((id) => !state.order.includes(id))]
    : pageIds

  const trackedOperation =
    state.trackedOperationId === null
      ? null
      : (records.get(state.trackedOperationId) ?? state.trackedOperation)

  return {
    ...state,
    order,
    records,
    totalCount: page.totalCount,
    nextOffset: page.nextOffset,
    hasMore: page.hasMore,
    trackedOperation,
  }
}

function mergeOperation(state: BackupRestoreDataState, operation: Backup): BackupRestoreDataState {
  const records = new Map(state.records)
  const mergedOperation = mergeBackupRecord(records.get(operation.id), operation)
  records.set(operation.id, mergedOperation)

  const isSourceBackup = mergedOperation.restoreSourceBackupId === null
  const order =
    isSourceBackup && !state.order.includes(mergedOperation.id)
      ? [mergedOperation.id, ...state.order]
      : state.order

  return {
    ...state,
    order,
    records,
    trackedOperationId: mergedOperation.id,
    trackedOperation: mergedOperation,
  }
}

function mergeBackupRecord(existing: Backup | undefined, incoming: Backup): Backup {
  if (existing === undefined) return incoming
  if (isTerminal(existing) && isTerminal(incoming) && existing.status !== incoming.status) {
    return existing
  }
  if (compareLifecycle(incoming, existing) >= 0) return incoming
  return existing
}

function isTerminal(backup: Backup): boolean {
  return backup.status === 'available' || backup.status === 'failed'
}

function compareLifecycle(left: Backup, right: Backup): number {
  const leftRank = lifecycleRank(left)
  const rightRank = lifecycleRank(right)
  for (let index = 0; index < leftRank.length; index += 1) {
    const leftValue = leftRank[index]
    const rightValue = rightRank[index]
    if (leftValue === undefined || rightValue === undefined) return 0
    const difference = leftValue - rightValue
    if (difference !== 0) return difference
  }
  return 0
}

function lifecycleRank(backup: Backup): readonly number[] {
  return [
    STATUS_RANK[backup.status],
    operationStageRank(backup),
    PHASE_RANK[backup.phase],
    backup.progress,
    CHECKPOINT_RANK[backup.checkpoint],
    CONTROL_STORE_RANK[backup.readiness.controlStore],
    ANALYTICS_STORE_RANK[backup.readiness.analyticsStore],
    STRUCTURAL_READINESS_RANK[backup.readiness.structural],
    CLEANUP_STATUS_RANK[backup.derivedCleanup.status],
    CLEANUP_STATUS_RANK[backup.backupCleanup.status],
  ]
}

function operationStageRank(backup: Backup): number {
  if (backup.status === 'creating') return 0
  if (backup.status === 'restoring') return RESTORE_STAGE_RANK[backup.phase]
  if (backup.status === 'available') return backup.cleanupPending ? 5 : 6
  return 7
}
