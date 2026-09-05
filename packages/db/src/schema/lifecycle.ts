import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { TSite } from './governance.ts'
import { TUser } from './auth.ts'
import type { JsonObject } from './types.ts'

export const TInstallation = sqliteTable(
  'installation',
  {
    id: text('id').primaryKey().notNull(),
    singletonKey: text('singleton_key').notNull().unique().default('default'),
    status: text('status', {
      enum: ['uninitialized', 'ready', 'degraded', 'maintenance', 'recovering'],
    })
      .notNull()
      .default('uninitialized'),
    eventRetentionMonths: integer('event_retention_months').notNull().default(12),
    profileRetentionMonths: integer('profile_retention_months').notNull().default(12),
    replayRetentionMonths: integer('replay_retention_months'),
    dataDirectoryReady: integer('data_directory_ready', { mode: 'boolean' })
      .notNull()
      .default(false),
    activeOperationId: text('active_operation_id'),
    activeOperationKind: text('active_operation_kind', {
      enum: [
        'backup',
        'restore',
        'upgrade',
        'retention',
        'cleanup',
        'site_deletion',
        'site_recovery',
        'site_purge',
      ],
    }),
    activeOperationPhase: text('active_operation_phase'),
    activeOperationCheckpoint: text('active_operation_checkpoint', {
      enum: ['none', 'sqlite_captured', 'duckdb_rebuilt', 'structurally_ready'],
    }),
    activeOperationProgress: real('active_operation_progress'),
    activeOperationOwnerToken: text('active_operation_owner_token'),
    activeOperationLastSafeSequence: integer('active_operation_last_safe_sequence'),
    activeOperationErrorCode: text('active_operation_error_code'),
    cleanupPending: integer('cleanup_pending', { mode: 'boolean' }).notNull().default(false),
    derivedCleanupStatus: text('derived_cleanup_status', {
      enum: ['not_applicable', 'not_started', 'pending', 'running', 'completed', 'failed'],
    })
      .notNull()
      .default('not_applicable'),
    derivedCleanupStartedAt: integer('derived_cleanup_started_at', { mode: 'timestamp_ms' }),
    derivedCleanupCompletedAt: integer('derived_cleanup_completed_at', { mode: 'timestamp_ms' }),
    derivedCleanupErrorCode: text('derived_cleanup_error_code'),
    backupCleanupStatus: text('backup_cleanup_status', {
      enum: ['not_applicable', 'not_started', 'pending', 'running', 'completed', 'failed'],
    })
      .notNull()
      .default('not_applicable'),
    backupCleanupStartedAt: integer('backup_cleanup_started_at', { mode: 'timestamp_ms' }),
    backupCleanupCompletedAt: integer('backup_cleanup_completed_at', { mode: 'timestamp_ms' }),
    backupCleanupErrorCode: text('backup_cleanup_error_code'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('installation_status_updated_idx').on(table.status, table.updatedAt),
    check('installation_singleton_key_check', sql`${table.singletonKey} = 'default'`),
    check(
      'installation_retention_policy_check',
      sql`${table.eventRetentionMonths} > 0 AND ${table.profileRetentionMonths} > 0 AND ${table.profileRetentionMonths} <= ${table.eventRetentionMonths} AND (${table.replayRetentionMonths} IS NULL OR (${table.replayRetentionMonths} > 0 AND ${table.replayRetentionMonths} < ${table.eventRetentionMonths} AND ${table.replayRetentionMonths} < ${table.profileRetentionMonths}))`,
    ),
    check(
      'installation_cleanup_pending_check',
      sql`${table.cleanupPending} = ((${table.derivedCleanupStatus} NOT IN ('not_applicable', 'completed')) OR (${table.backupCleanupStatus} NOT IN ('not_applicable', 'completed')))`,
    ),
    check(
      'installation_cleanup_order_check',
      sql`${table.backupCleanupStatus} IN ('not_applicable', 'not_started', 'pending') OR ${table.derivedCleanupStatus} = 'completed'`,
    ),
  ],
)

export const TRetentionPolicy = sqliteTable(
  'retention_policy',
  {
    id: text('id').primaryKey().notNull(),
    installationId: text('installation_id')
      .notNull()
      .references(() => TInstallation.id, { onDelete: 'restrict' }),
    siteId: text('site_id').references(() => TSite.id, { onDelete: 'restrict' }),
    scope: text('scope', { enum: ['installation', 'site'] }).notNull(),
    eventMonths: integer('event_months').notNull(),
    profileMonths: integer('profile_months').notNull(),
    replayMonths: integer('replay_months'),
    version: integer('version').notNull(),
    status: text('status', { enum: ['active', 'superseded'] }).notNull(),
    effectiveFrom: integer('effective_from', { mode: 'timestamp_ms' }).notNull(),
    effectiveTo: integer('effective_to', { mode: 'timestamp_ms' }),
    changedBy: text('changed_by').references(() => TUser.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('retention_policy_installation_version_unique')
      .on(table.installationId, table.version)
      .where(sql`${table.scope} = 'installation'`),
    uniqueIndex('retention_policy_site_version_unique')
      .on(table.installationId, table.siteId, table.version)
      .where(sql`${table.scope} = 'site'`),
    check(
      'retention_policy_scope_site_check',
      sql`(${table.scope} = 'installation' AND ${table.siteId} IS NULL) OR (${table.scope} = 'site' AND ${table.siteId} IS NOT NULL)`,
    ),
    check(
      'retention_policy_values_check',
      sql`${table.eventMonths} > 0 AND ${table.profileMonths} > 0 AND ${table.profileMonths} <= ${table.eventMonths} AND (${table.replayMonths} IS NULL OR (${table.replayMonths} > 0 AND ${table.replayMonths} < ${table.eventMonths} AND ${table.replayMonths} < ${table.profileMonths}))`,
    ),
    uniqueIndex('retention_policy_current_installation_unique')
      .on(table.installationId)
      .where(sql`${table.scope} = 'installation' AND ${table.status} = 'active'`),
    uniqueIndex('retention_policy_current_site_unique')
      .on(table.installationId, table.siteId)
      .where(sql`${table.scope} = 'site' AND ${table.status} = 'active'`),
    index('retention_policy_effective_idx').on(
      table.installationId,
      table.siteId,
      table.effectiveFrom,
    ),
  ],
)

export const TRetentionCleanupRun = sqliteTable(
  'retention_cleanup_run',
  {
    id: text('id').primaryKey().notNull(),
    installationId: text('installation_id')
      .notNull()
      .references(() => TInstallation.id, { onDelete: 'restrict' }),
    siteId: text('site_id')
      .notNull()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    policyId: text('policy_id')
      .notNull()
      .references(() => TRetentionPolicy.id, { onDelete: 'restrict' }),
    cleanupKind: text('cleanup_kind', { enum: ['derived', 'backup'] }).notNull(),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] })
      .notNull()
      .default('queued'),
    eventOccurrenceCutoffAt: integer('event_occurrence_cutoff_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    rawReceiptCutoffAt: integer('raw_receipt_cutoff_at', { mode: 'timestamp_ms' }).notNull(),
    profileActivityCutoffAt: integer('profile_activity_cutoff_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    replayReceiptCutoffAt: integer('replay_receipt_cutoff_at', { mode: 'timestamp_ms' }),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('retention_cleanup_run_status_idx').on(
      table.installationId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex('retention_cleanup_run_active_unique')
      .on(table.installationId, table.siteId, table.cleanupKind)
      .where(sql`${table.status} IN ('queued', 'running')`),
    uniqueIndex('retention_cleanup_run_id_kind_unique').on(table.id, table.cleanupKind),
  ],
)

export const TRetentionCleanupCheckpoint = sqliteTable(
  'retention_cleanup_checkpoint',
  {
    id: text('id').primaryKey().notNull(),
    cleanupRunId: text('cleanup_run_id')
      .notNull()
      .references(() => TRetentionCleanupRun.id, { onDelete: 'cascade' }),
    dataClass: text('data_class').notNull(),
    stage: text('stage', { enum: ['derived', 'backup'] }).notNull(),
    cursor: text('cursor'),
    processedThrough: integer('processed_through', { mode: 'timestamp_ms' }),
    status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('retention_cleanup_checkpoint_unique').on(
      table.cleanupRunId,
      table.stage,
      table.dataClass,
    ),
    index('retention_cleanup_checkpoint_status_idx').on(table.cleanupRunId, table.status),
    foreignKey({
      columns: [table.cleanupRunId, table.stage],
      foreignColumns: [TRetentionCleanupRun.id, TRetentionCleanupRun.cleanupKind],
      name: 'retention_cleanup_checkpoint_stage_fk',
    }),
  ],
)

export const TRetentionEffectiveCutoff = sqliteTable(
  'retention_effective_cutoff',
  {
    siteId: text('site_id')
      .primaryKey()
      .references(() => TSite.id, { onDelete: 'restrict' }),
    installationId: text('installation_id')
      .notNull()
      .references(() => TInstallation.id, { onDelete: 'restrict' }),
    policyId: text('policy_id')
      .notNull()
      .references(() => TRetentionPolicy.id, { onDelete: 'restrict' }),
    reportingTimezone: text('reporting_timezone').notNull(),
    localDay: text('local_day').notNull(),
    eventOccurrenceCutoffAt: integer('event_occurrence_cutoff_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    rawReceiptCutoffAt: integer('raw_receipt_cutoff_at', { mode: 'timestamp_ms' }).notNull(),
    profileActivityCutoffAt: integer('profile_activity_cutoff_at', {
      mode: 'timestamp_ms',
    }).notNull(),
    replayReceiptCutoffAt: integer('replay_receipt_cutoff_at', { mode: 'timestamp_ms' }),
    effectiveAt: integer('effective_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('retention_effective_cutoff_installation_idx').on(table.installationId),
    check(
      'retention_effective_cutoff_local_day_check',
      sql`length(${table.localDay}) = 10 AND ${table.localDay} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
  ],
)

export const TBackupOperation = sqliteTable(
  'backup_operation',
  {
    id: text('id').primaryKey().notNull(),
    operationType: text('operation_type', { enum: ['backup', 'restore', 'upgrade'] }).notNull(),
    status: text('status', { enum: ['creating', 'available', 'restoring', 'failed'] }).notNull(),
    scope: text('scope', { enum: ['installation'] })
      .notNull()
      .default('installation'),
    phase: text('phase', {
      enum: [
        'capturing_sqlite',
        'restoring_sqlite',
        'rebuilding_duckdb',
        'cleanup_pending',
        'ready',
        'failed',
      ],
    }).notNull(),
    progress: real('progress').notNull().default(0),
    checkpoint: text('checkpoint', {
      enum: ['none', 'sqlite_captured', 'sqlite_restored', 'duckdb_rebuilt', 'structurally_ready'],
    }).notNull(),
    lastSafeSequence: integer('last_safe_sequence'),
    controlReadiness: text('control_readiness', { enum: ['not_ready', 'ready'] }).notNull(),
    analyticsReadiness: text('analytics_readiness', {
      enum: ['not_ready', 'ready', 'rebuilding'],
    }).notNull(),
    structuralReadiness: text('structural_readiness', { enum: ['not_ready', 'ready'] }).notNull(),
    cleanupPending: integer('cleanup_pending', { mode: 'boolean' }).notNull().default(false),
    errorCode: text('error_code', {
      enum: [
        'BACKUP_FAILED',
        'INCOMPATIBLE_BACKUP',
        'INSUFFICIENT_STORAGE',
        'CONFLICT',
        'INTERNAL_SERVER_ERROR',
      ],
    }),
    recoveryKey: text('recovery_key').unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ownerToken: text('owner_token'),
  },
  (table) => [
    index('backup_operation_scope_created_idx').on(table.scope, table.createdAt, table.id),
    index('backup_operation_status_phase_idx').on(table.status, table.phase),
    uniqueIndex('backup_operation_active_unique')
      .on(table.scope)
      .where(sql`${table.status} IN ('creating', 'restoring')`),
    check(
      'backup_operation_progress_check',
      sql`${table.progress} >= 0 AND ${table.progress} <= 1`,
    ),
  ],
)

export const TBackupArtifact = sqliteTable(
  'backup_artifact',
  {
    id: text('id').primaryKey().notNull(),
    operationId: text('operation_id')
      .notNull()
      .references(() => TBackupOperation.id, { onDelete: 'cascade' }),
    artifactType: text('artifact_type', {
      enum: ['authoritative_sqlite', 'pre_restore_sqlite', 'duckdb_accelerator'],
    }).notNull(),
    generationId: text('generation_id').notNull(),
    storageKey: text('storage_key').notNull(),
    schemaVersion: text('schema_version').notNull(),
    retentionBoundary: integer('retention_boundary', { mode: 'timestamp_ms' }),
    acceptanceSequence: integer('acceptance_sequence'),
    sizeBytes: integer('size_bytes').notNull(),
    checksumAlgorithm: text('checksum_algorithm').notNull(),
    checksumValue: text('checksum_value').notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<JsonObject | null>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('backup_artifact_operation_type_unique').on(table.operationId, table.artifactType),
    index('backup_artifact_generation_idx').on(table.generationId),
  ],
)

export const TBackupRestoreReference = sqliteTable('backup_restore_reference', {
  operationId: text('operation_id')
    .primaryKey()
    .references(() => TBackupOperation.id, { onDelete: 'cascade' }),
  restoreSourceBackupId: text('restore_source_backup_id')
    .notNull()
    .references(() => TBackupOperation.id, { onDelete: 'restrict' }),
  preRestoreSafetyArtifactId: text('pre_restore_safety_artifact_id')
    .notNull()
    .references(() => TBackupArtifact.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const TBackupCleanupStage = sqliteTable(
  'backup_cleanup_stage',
  {
    operationId: text('operation_id')
      .notNull()
      .references(() => TBackupOperation.id, { onDelete: 'cascade' }),
    stage: text('stage', { enum: ['derived_cleanup', 'backup_cleanup'] }).notNull(),
    status: text('status', {
      enum: ['not_applicable', 'not_started', 'pending', 'running', 'completed', 'failed'],
    }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    errorCode: text('error_code', {
      enum: [
        'BACKUP_FAILED',
        'INCOMPATIBLE_BACKUP',
        'INSUFFICIENT_STORAGE',
        'CONFLICT',
        'INTERNAL_SERVER_ERROR',
      ],
    }),
  },
  (table) => [
    primaryKey({ columns: [table.operationId, table.stage] }),
    check(
      'backup_cleanup_stage_status_check',
      sql`(${table.status} IN ('not_applicable', 'not_started', 'pending') AND ${table.startedAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.errorCode} IS NULL) OR (${table.status} = 'running' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.errorCode} IS NULL) OR (${table.status} = 'completed' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.errorCode} IS NULL) OR (${table.status} = 'failed' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.errorCode} IS NOT NULL)`,
    ),
  ],
)
