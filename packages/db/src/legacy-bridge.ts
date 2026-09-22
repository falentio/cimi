import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type Database from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { closeDb, createDb, dbStorageLocation, installDbFromFile, type Db } from './client.ts'
import {
  BASE_SKELETON_TABLES,
  type CurrentMigrationPlan,
  ControlMigrationIncompatibilityError,
} from './migration-plan.ts'

export interface LegacyLedgerEntry {
  readonly id: number
  readonly createdAt: number
  readonly hash: string
}

export const LEGACY_471C10D_LEDGER: readonly LegacyLedgerEntry[] = [
  {
    id: 1,
    createdAt: 1787598567675,
    hash: '2c25ec4ef04d1f9885c3725b3a64353c722dee0343038e4f3c922f72ca08e72b',
  },
  {
    id: 2,
    createdAt: 1787625779909,
    hash: 'f110e0d49d41f6d6691d785e7ca75108363b6c199de3f4b2353d526dc58f9a58',
  },
  {
    id: 3,
    createdAt: 1787626099955,
    hash: 'e9a9edfc489717afbcbc63d57b72d5f20d119239d1eed40c80b351ee4c2e796d',
  },
  {
    id: 4,
    createdAt: 1787626219132,
    hash: '5d0ab061145e175df0c74764140dbb8a41c63f9a96b5f6eb6502a56dc9f81f40',
  },
]

export const LEGACY_SCHEMA_FINGERPRINT =
  '1838f55f6151fdb0907c4d53efbb59191b73fc0965969b38441be21e500dc0d7'

export type ControlLineage =
  | { readonly kind: 'empty' }
  | { readonly kind: 'legacy-471c10d' }
  | { readonly kind: 'incompatible'; readonly reason: string }

interface IntrospectedColumn {
  readonly name: string
  readonly type: string
  readonly notnull: number
  readonly pk: number
  readonly dflt: string | null
}

interface IntrospectedIndex {
  readonly name: string
  readonly unique: number
  readonly columns: readonly string[]
}

interface IntrospectedForeignKey {
  readonly id: number
  readonly table: string
  readonly from: string
  readonly to: string | null
  readonly on_update: string
  readonly on_delete: string
}

interface IntrospectedTable {
  readonly name: string
  readonly columns: readonly IntrospectedColumn[]
  readonly indexes: readonly IntrospectedIndex[]
  readonly foreignKeys: readonly IntrospectedForeignKey[]
}

interface IntrospectedSchema {
  readonly tables: readonly IntrospectedTable[]
  readonly objects: readonly string[]
}

interface PragmaColumnRow {
  name: string
  type: string | null
  notnull: number
  pk: number
  dflt_value: string | null
}

interface PragmaIndexRow {
  seq: number
  name: string
  unique: number
}

interface PragmaIndexInfoRow {
  seqno: number
  name: string
}

interface PragmaForeignKeyRow {
  id: number
  seq: number
  table: string
  from: string
  to: string | null
  on_update: string
  on_delete: string
}

interface MasterRow {
  name: string
}

export function computeLegacySchemaFingerprint(client: Database.Database): string {
  return createHash('sha256')
    .update(JSON.stringify(introspectSchema(client)))
    .digest('hex')
}

export function classifyControlLineage(client: Database.Database): ControlLineage {
  const ledgerRows = readLedgerRows(client)
  const userTables = readUserTables(client)

  if (ledgerRows.length === 0) {
    if (userTables.length === 0) return { kind: 'empty' }
    return { kind: 'incompatible', reason: 'Migration ledger is empty but user tables exist' }
  }

  if (ledgerRows.length > LEGACY_471C10D_LEDGER.length) {
    return { kind: 'incompatible', reason: 'Migration history is newer than legacy 471c10d' }
  }

  if (ledgerRows.length < LEGACY_471C10D_LEDGER.length) {
    return { kind: 'incompatible', reason: 'Migration history is a partial legacy prefix' }
  }

  const ledgerMatches = LEGACY_471C10D_LEDGER.every((entry, index) => {
    const row = ledgerRows[index]
    return (
      row !== undefined &&
      row.id === entry.id &&
      row.created_at === entry.createdAt &&
      row.hash === entry.hash
    )
  })
  if (!ledgerMatches) {
    return { kind: 'incompatible', reason: 'Migration ledger does not match legacy 471c10d' }
  }

  if (userTables.some((name) => name.startsWith('__new_'))) {
    return { kind: 'incompatible', reason: 'Unfinished table rebuild tables remain' }
  }

  if (computeLegacySchemaFingerprint(client) !== LEGACY_SCHEMA_FINGERPRINT) {
    return { kind: 'incompatible', reason: 'Schema does not match the legacy 471c10d fingerprint' }
  }

  const integrity = client.pragma('integrity_check', { simple: true }) as string
  if (integrity !== 'ok') {
    return { kind: 'incompatible', reason: `Database integrity check failed: ${integrity}` }
  }

  const foreignKeyViolations = client.prepare('PRAGMA foreign_key_check').all()
  if (foreignKeyViolations.length > 0) {
    return { kind: 'incompatible', reason: 'Foreign key violations are present' }
  }

  return { kind: 'legacy-471c10d' }
}

function introspectSchema(client: Database.Database): IntrospectedSchema {
  const tables = client
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
    )
    .all() as Array<MasterRow>
  return {
    tables: tables.map((table) => ({
      name: table.name,
      columns: introspectColumns(client, table.name),
      indexes: introspectIndexes(client, table.name),
      foreignKeys: introspectForeignKeys(client, table.name),
    })),
    objects: readObjectNames(client),
  }
}

function introspectColumns(
  client: Database.Database,
  table: string,
): readonly IntrospectedColumn[] {
  const rows = client.prepare(`PRAGMA table_info('${table}')`).all() as Array<PragmaColumnRow>
  return rows.map((row) => ({
    name: row.name,
    type: (row.type ?? '').toUpperCase(),
    notnull: row.notnull,
    pk: row.pk,
    dflt: row.dflt_value === null || row.dflt_value === undefined ? null : String(row.dflt_value),
  }))
}

function introspectIndexes(client: Database.Database, table: string): readonly IntrospectedIndex[] {
  const rows = client.prepare(`PRAGMA index_list('${table}')`).all() as Array<PragmaIndexRow>
  return rows
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((row) => {
      const columns = client
        .prepare(`PRAGMA index_info('${row.name}')`)
        .all() as Array<PragmaIndexInfoRow>
      return {
        name: row.name,
        unique: row.unique,
        columns: columns.map((column) => column.name),
      }
    })
}

function introspectForeignKeys(
  client: Database.Database,
  table: string,
): readonly IntrospectedForeignKey[] {
  const rows = client
    .prepare(`PRAGMA foreign_key_list('${table}')`)
    .all() as Array<PragmaForeignKeyRow>
  return rows
    .toSorted((a, b) => a.id - b.id)
    .map((row) => ({
      id: row.id,
      table: row.table,
      from: row.from,
      to: row.to,
      on_update: row.on_update,
      on_delete: row.on_delete,
    }))
}

function readObjectNames(client: Database.Database): readonly string[] {
  const rows = client
    .prepare(
      "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
    )
    .all() as Array<MasterRow>
  return rows.map((row) => row.name)
}

function readUserTables(client: Database.Database): readonly string[] {
  const rows = client
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
    )
    .all() as Array<MasterRow>
  return rows.map((row) => row.name)
}

interface LedgerRow {
  id: number
  hash: string
  created_at: number
}

function readLedgerRows(client: Database.Database): readonly LedgerRow[] {
  const ledgerTable = client
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get() as MasterRow | undefined
  if (ledgerTable === undefined) return []
  return client
    .prepare('SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at, id')
    .all() as Array<LedgerRow>
}

const LEGACY_BASELINE_TAG = '0000_clammy_trish_tilby'
const LEGACY_FINAL_TAG = '0015_normalize_legacy_public_dashboard'

interface CopyTableProjection {
  readonly column: string
  readonly value: null
}

interface LegacyCopyTable {
  readonly table: string
  readonly columns: readonly string[]
  readonly projectedColumns?: readonly CopyTableProjection[]
}

const LEGACY_COPY_PLAN: readonly LegacyCopyTable[] = [
  {
    table: 'accepted_event',
    columns: [
      'event_pk',
      'site_id',
      'event_id',
      'event_kind',
      'occurrence_time',
      'receipt_time',
      'late',
      'visitor_id',
      'identified_user_id',
      'analytics_session_id',
      'policy_revision_id',
      'replay_sequence',
      'payload_fingerprint',
      'projection_state',
      'projected_at',
      'created_at',
    ],
  },
  {
    table: 'account',
    columns: [
      'id',
      'account_id',
      'provider_id',
      'user_id',
      'access_token',
      'refresh_token',
      'id_token',
      'access_token_expires_at',
      'refresh_token_expires_at',
      'scope',
      'password',
      'issuer',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'backup_artifact',
    columns: [
      'id',
      'operation_id',
      'artifact_type',
      'generation_id',
      'storage_key',
      'schema_version',
      'retention_boundary',
      'acceptance_sequence',
      'size_bytes',
      'checksum_algorithm',
      'checksum_value',
      'metadata',
      'created_at',
    ],
  },
  {
    table: 'backup_cleanup_stage',
    columns: ['operation_id', 'stage', 'status', 'started_at', 'completed_at', 'error_code'],
  },
  {
    table: 'backup_operation',
    columns: [
      'id',
      'operation_type',
      'status',
      'scope',
      'phase',
      'progress',
      'checkpoint',
      'last_safe_sequence',
      'control_readiness',
      'analytics_readiness',
      'structural_readiness',
      'cleanup_pending',
      'error_code',
      'recovery_key',
      'created_at',
      'started_at',
      'completed_at',
      'updated_at',
    ],
  },
  {
    table: 'backup_restore_reference',
    columns: [
      'operation_id',
      'restore_source_backup_id',
      'pre_restore_safety_artifact_id',
      'created_at',
    ],
  },
  {
    table: 'cohort',
    columns: [
      'id',
      'site_id',
      'name',
      'identity_kind',
      'period',
      'status',
      'current_version',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'cohort_version',
    columns: [
      'id',
      'cohort_id',
      'version',
      'name',
      'entry_action_json',
      'retention_action_json',
      'identity_kind',
      'period',
      'effective_at',
      'created_at',
    ],
  },
  {
    table: 'collection_policy_revision',
    columns: [
      'id',
      'installation_id',
      'scope',
      'site_id',
      'version',
      'policy_json',
      'effective_from',
      'effective_to',
      'committed_at',
      'created_by',
      'created_at',
    ],
  },
  {
    table: 'event_acceptance_journal',
    columns: [
      'event_pk',
      'replay_sequence',
      'payload_fingerprint',
      'receipt_time',
      'policy_revision_id',
      'acceptance_state',
      'projection_state',
      'committed_at',
      'flush_id',
    ],
  },
  { table: 'event_custom', columns: ['event_pk', 'name'] },
  { table: 'event_error', columns: ['event_pk', 'name', 'code', 'message'] },
  { table: 'event_outbound', columns: ['event_pk', 'destination', 'name'] },
  { table: 'event_page_view', columns: ['event_pk', 'page_path', 'referrer'] },
  { table: 'event_payload', columns: ['event_pk', 'canonical_payload_json'] },
  { table: 'event_performance', columns: ['event_pk', 'name', 'value', 'unit'] },
  {
    table: 'event_property',
    columns: [
      'event_pk',
      'property_key',
      'value_type',
      'string_value',
      'number_value',
      'boolean_value',
    ],
  },
  {
    table: 'funnel',
    columns: [
      'id',
      'site_id',
      'name',
      'identity_kind',
      'status',
      'current_version',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'funnel_version',
    columns: [
      'id',
      'funnel_id',
      'version',
      'name',
      'steps_json',
      'identity_kind',
      'effective_at',
      'created_at',
    ],
  },
  {
    table: 'goal',
    columns: [
      'id',
      'site_id',
      'name',
      'action_json',
      'property_filters_json',
      'identity_kind',
      'status',
      'current_version',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'goal_version',
    columns: [
      'id',
      'goal_id',
      'version',
      'name',
      'action_json',
      'property_filters_json',
      'identity_kind',
      'effective_at',
      'created_at',
    ],
  },
  {
    table: 'identity_link',
    columns: [
      'id',
      'site_id',
      'profile_id',
      'profile_epoch',
      'anonymous_identity_id',
      'analytics_session_id',
      'effective_from',
      'linked_at',
      'unlinked_at',
    ],
  },
  {
    table: 'identity_profile',
    columns: [
      'profile_id',
      'site_id',
      'identified_user_id',
      'status',
      'profile_epoch',
      'traits',
      'first_seen_at',
      'last_seen_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'identity_profile_epoch',
    columns: [
      'profile_id',
      'site_id',
      'identified_user_id',
      'epoch',
      'status',
      'started_at',
      'ended_at',
      'redacted_at',
    ],
  },
  {
    table: 'identity_redaction',
    columns: [
      'id',
      'site_id',
      'profile_id',
      'identified_user_id',
      'profile_epoch',
      'reason',
      'status',
      'requested_at',
      'applied_at',
      'derived_cleanup_status',
      'backup_cleanup_status',
      'derived_cleanup_updated_at',
      'backup_cleanup_updated_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'installation',
    columns: [
      'id',
      'singleton_key',
      'status',
      'event_retention_months',
      'profile_retention_months',
      'replay_retention_months',
      'data_directory_ready',
      'active_operation_id',
      'active_operation_kind',
      'active_operation_phase',
      'active_operation_progress',
      'active_operation_last_safe_sequence',
      'active_operation_error_code',
      'cleanup_pending',
      'derived_cleanup_status',
      'derived_cleanup_started_at',
      'derived_cleanup_completed_at',
      'derived_cleanup_error_code',
      'backup_cleanup_status',
      'backup_cleanup_started_at',
      'backup_cleanup_completed_at',
      'backup_cleanup_error_code',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'invitation',
    columns: [
      'id',
      'organization_id',
      'role',
      'token_hash',
      'expires_at',
      'status',
      'accepted_at',
      'revoked_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'membership',
    columns: ['organization_id', 'user_id', 'role', 'created_at', 'updated_at'],
  },
  {
    table: 'organization',
    columns: ['id', 'name', 'owner_user_id', 'is_personal', 'created_at', 'updated_at'],
    projectedColumns: [{ column: 'authority_organization_id', value: null }],
  },
  {
    table: 'projection_checkpoint',
    columns: [
      'site_id',
      'projected_replay_sequence',
      'occurrence_covered_from',
      'occurrence_covered_through',
      'effective_retention_from',
      'statistics_refreshed_at',
      'readiness',
      'projection_version',
      'updated_at',
    ],
  },
  {
    table: 'projection_gap',
    columns: [
      'id',
      'site_id',
      'occurrence_from',
      'occurrence_to',
      'unbounded',
      'status',
      'observed_at',
      'resolved_at',
    ],
  },
  {
    table: 'public_dashboard',
    columns: [
      'site_id',
      'enabled',
      'public_identifier',
      'public_identifier_hash',
      'created_at',
      'updated_at',
      'rotated_at',
    ],
  },
  {
    table: 'retention_cleanup_checkpoint',
    columns: [
      'id',
      'cleanup_run_id',
      'data_class',
      'stage',
      'cursor',
      'processed_through',
      'status',
      'updated_at',
    ],
  },
  {
    table: 'retention_cleanup_run',
    columns: [
      'id',
      'installation_id',
      'site_id',
      'policy_id',
      'cleanup_kind',
      'status',
      'cutoff_at',
      'started_at',
      'completed_at',
      'last_error',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'retention_policy',
    columns: [
      'id',
      'installation_id',
      'site_id',
      'scope',
      'event_months',
      'profile_months',
      'replay_months',
      'version',
      'status',
      'effective_from',
      'effective_to',
      'changed_by',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'session',
    columns: [
      'id',
      'expires_at',
      'token',
      'ip_address',
      'user_agent',
      'user_id',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'site',
    columns: [
      'id',
      'organization_id',
      'name',
      'hostname',
      'ingestion_identifier',
      'reporting_timezone',
      'week_starts_on',
      'status',
      'delete_requested_at',
      'deleted_at',
      'recovery_deadline',
      'purge_at',
      'purged_at',
      'current_operation_id',
      'cleanup_status',
      'cleanup_updated_at',
      'cleanup_error',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'site_lifecycle_operation',
    columns: [
      'id',
      'site_id',
      'operation_type',
      'status',
      'requested_at',
      'started_at',
      'completed_at',
      'error_summary',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'site_tombstone',
    columns: [
      'site_id',
      'organization_id',
      'hostname',
      'purge_operation_id',
      'purged_at',
      'created_at',
    ],
  },
  {
    table: 'user',
    columns: [
      'id',
      'name',
      'email',
      'email_verified',
      'image',
      'role',
      'banned',
      'ban_reason',
      'ban_expires',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'verification',
    columns: ['id', 'identifier', 'value', 'expires_at', 'created_at', 'updated_at'],
  },
]

interface LegacyTableSnapshot {
  readonly table: string
  readonly columns: readonly string[]
  readonly rows: readonly unknown[][]
  readonly primaryKeyIndices: readonly number[]
}

interface LegacySnapshot {
  readonly tables: readonly LegacyTableSnapshot[]
  readonly digests: ReadonlyMap<string, TableDigest>
}

interface TableDigest {
  readonly count: number
  readonly sha256: string
}

interface BridgeWorkspace {
  readonly directory: string
  readonly stagedPath: string
  readonly baselineFolder: string
}

export interface BridgeLegacyControlDbInput {
  readonly source: Db
  readonly plan: CurrentMigrationPlan
}

export function bridgeLegacyControlDb(input: BridgeLegacyControlDbInput): void {
  assertPlanCarriesCurrentLine(input.plan)
  const lineage = classifyControlLineage(input.source.$client)
  if (lineage.kind !== 'legacy-471c10d') {
    throw new ControlMigrationIncompatibilityError(
      lineage.kind === 'incompatible'
        ? lineage.reason
        : 'Control database is not a legacy 471c10d database',
    )
  }

  const snapshot = readLegacySnapshot(input.source.$client, LEGACY_COPY_PLAN)
  const workspace = createBridgeWorkspace(dbStorageLocation(input.source))
  try {
    materializeBaselineFolder(workspace, input.plan)
    const staged = createDb({ path: workspace.stagedPath })
    try {
      migrate(staged, {
        migrationsFolder: workspace.baselineFolder,
        migrationsTable: '__drizzle_migrations',
      })
      copyLegacyData(staged.$client, snapshot, LEGACY_COPY_PLAN)
      assertPreservation(staged.$client, snapshot, LEGACY_COPY_PLAN)
      migrate(staged, {
        migrationsFolder: input.plan.folder,
        migrationsTable: '__drizzle_migrations',
      })
      validateStagedFinalState(staged.$client, input.plan)
      staged.$client.pragma('wal_checkpoint(TRUNCATE)')
    } finally {
      closeDb(staged)
    }
    installDbFromFile(input.source, workspace.stagedPath)
  } finally {
    rmSync(workspace.directory, { recursive: true, force: true })
  }
}

function assertPlanCarriesCurrentLine(plan: CurrentMigrationPlan): void {
  if (plan.baseline.tag !== LEGACY_BASELINE_TAG || plan.final.tag !== LEGACY_FINAL_TAG) {
    throw new ControlMigrationIncompatibilityError(
      `Selected migration folder does not carry the current line ${LEGACY_BASELINE_TAG} through ${LEGACY_FINAL_TAG}`,
    )
  }
}

function createBridgeWorkspace(location: ReturnType<typeof dbStorageLocation>): BridgeWorkspace {
  const parent = location.kind === 'file' ? dirname(location.path) : tmpdir()
  const directory = mkdtempSync(join(parent, 'legacy-bridge-'))
  return {
    directory,
    stagedPath: join(directory, 'staged-control.sqlite'),
    baselineFolder: join(directory, 'baseline'),
  }
}

function materializeBaselineFolder(workspace: BridgeWorkspace, plan: CurrentMigrationPlan): void {
  mkdirSync(join(workspace.baselineFolder, 'meta'), { recursive: true })
  copyFileSync(
    join(plan.folder, `${plan.baseline.tag}.sql`),
    join(workspace.baselineFolder, `${plan.baseline.tag}.sql`),
  )
  writeFileSync(
    join(workspace.baselineFolder, 'meta/_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: [
        {
          idx: 0,
          version: '6',
          when: plan.baseline.createdAt,
          tag: plan.baseline.tag,
          breakpoints: true,
        },
      ],
    }),
  )
}

function readLegacySnapshot(
  client: Database.Database,
  copyPlan: readonly LegacyCopyTable[],
): LegacySnapshot {
  const tables: LegacyTableSnapshot[] = []
  const digests = new Map<string, TableDigest>()
  for (const spec of copyPlan) {
    const primaryKeyIndices = readPrimaryKeyIndices(client, spec.table, spec.columns)
    const rows = client
      .prepare(
        `SELECT ${spec.columns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(spec.table)}`,
      )
      .raw()
      .all() as Array<unknown[]>
    if (spec.table === 'account') {
      validateAccountPreconditions(spec.columns, rows)
    }
    tables.push({ table: spec.table, columns: spec.columns, rows, primaryKeyIndices })
    digests.set(spec.table, computeDigest(rows, primaryKeyIndices, spec.projectedColumns))
  }
  return { tables, digests }
}

function validateAccountPreconditions(
  columns: readonly string[],
  rows: readonly unknown[][],
): void {
  const issuerIndex = columns.indexOf('issuer')
  const accountIdIndex = columns.indexOf('account_id')
  const idIndex = columns.indexOf('id')
  const userIdIndex = columns.indexOf('user_id')
  const nullIssuerRows = rows.filter((row) => row[issuerIndex] === null)
  if (nullIssuerRows.length > 0) {
    throw new ControlMigrationIncompatibilityError(
      `Legacy table account has ${nullIssuerRows.length} row(s) with a null issuer column; issuer cannot be inferred safely. Sample (id, user_id) pairs: ${formatSamples(nullIssuerRows, idIndex, userIdIndex)}`,
    )
  }
  const seen = new Set<string>()
  const duplicateRows: unknown[][] = []
  for (const row of rows) {
    const key = `${serializeScalar(row[issuerIndex])}\u0000${serializeScalar(row[accountIdIndex])}`
    if (seen.has(key)) {
      duplicateRows.push(row)
    } else {
      seen.add(key)
    }
  }
  if (duplicateRows.length > 0) {
    throw new ControlMigrationIncompatibilityError(
      `Legacy table account has ${duplicateRows.length} duplicate (issuer, account_id) pairs. Sample (id, user_id) pairs: ${formatSamples(duplicateRows, idIndex, userIdIndex)}`,
    )
  }
}

function formatSamples(rows: readonly unknown[][], idIndex: number, userIdIndex: number): string {
  return rows
    .slice(0, 5)
    .map((row) => `(${JSON.stringify(row[idIndex])}, ${JSON.stringify(row[userIdIndex])})`)
    .join(', ')
}

function readPrimaryKeyIndices(
  client: Database.Database,
  table: string,
  columns: readonly string[],
): readonly number[] {
  const rows = client.prepare(`PRAGMA table_info('${table}')`).all() as Array<{
    name: string
    pk: number
  }>
  const primaryKeyColumns = rows
    .filter((row) => row.pk > 0)
    .toSorted((a, b) => a.pk - b.pk)
    .map((row) => row.name)
  if (primaryKeyColumns.length === 0) {
    throw new Error(`Legacy table ${table} has no primary key`)
  }
  return primaryKeyColumns.map((name) => {
    const index = columns.indexOf(name)
    if (index === -1) {
      throw new Error(`Legacy table ${table} primary key column ${name} is not in the copy plan`)
    }
    return index
  })
}

function resolveInsertOrder(
  client: Database.Database,
  tables: readonly string[],
): readonly string[] {
  const tableSet = new Set(tables)
  const dependencies = new Map<string, ReadonlySet<string>>()
  for (const table of tables) {
    const foreignKeys = client.prepare(`PRAGMA foreign_key_list('${table}')`).all() as Array<{
      table: string
    }>
    dependencies.set(
      table,
      new Set(
        foreignKeys
          .map((fk) => fk.table)
          .filter((parent) => tableSet.has(parent) && parent !== table),
      ),
    )
  }
  const ordered: string[] = []
  const remaining = new Set(tables)
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((table) =>
        [...(dependencies.get(table) ?? [])].every((parent) => !remaining.has(parent)),
      )
      .sort()
    if (ready.length === 0) {
      throw new Error(
        `Unsupported foreign key cycle among legacy tables: ${[...remaining].sort().join(', ')}`,
      )
    }
    for (const table of ready) {
      ordered.push(table)
      remaining.delete(table)
    }
  }
  return ordered
}

function copyLegacyData(
  client: Database.Database,
  snapshot: LegacySnapshot,
  copyPlan: readonly LegacyCopyTable[],
): void {
  const planByTable = new Map(copyPlan.map((spec) => [spec.table, spec]))
  const snapshotByTable = new Map(snapshot.tables.map((table) => [table.table, table]))
  const insertOrder = resolveInsertOrder(
    client,
    copyPlan.map((spec) => spec.table),
  )
  client.pragma('foreign_keys = OFF')
  client.exec('BEGIN')
  try {
    for (const table of insertOrder) {
      const spec = planByTable.get(table)
      const snapshotTable = snapshotByTable.get(table)
      if (spec === undefined || snapshotTable === undefined) {
        throw new Error(`Legacy copy plan is missing table ${table}`)
      }
      const insertColumns = [
        ...spec.columns,
        ...(spec.projectedColumns?.map((projection) => projection.column) ?? []),
      ]
      const statement = client.prepare(
        `INSERT INTO ${quoteIdentifier(table)} (${insertColumns.map(quoteIdentifier).join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
      )
      const projectionValues = spec.projectedColumns?.map((projection) => projection.value) ?? []
      for (const row of snapshotTable.rows) {
        statement.run(...row, ...projectionValues)
      }
    }
    const violations = client.prepare('PRAGMA foreign_key_check').all() as Array<{ table: string }>
    if (violations.length > 0) {
      throw new ControlMigrationIncompatibilityError(
        `Copied legacy data violates foreign keys on tables: ${[...new Set(violations.map((violation) => violation.table))].sort().join(', ')}`,
      )
    }
    client.exec('COMMIT')
  } catch (error) {
    try {
      client.exec('ROLLBACK')
    } catch {}
    throw error
  } finally {
    client.pragma('foreign_keys = ON')
  }
}

function assertPreservation(
  stagedClient: Database.Database,
  snapshot: LegacySnapshot,
  copyPlan: readonly LegacyCopyTable[],
): void {
  const planByTable = new Map(copyPlan.map((spec) => [spec.table, spec]))
  for (const snapshotTable of snapshot.tables) {
    const spec = planByTable.get(snapshotTable.table)
    if (spec === undefined) {
      throw new Error(`Legacy copy plan is missing table ${snapshotTable.table}`)
    }
    const readColumns = [
      ...spec.columns,
      ...(spec.projectedColumns?.map((projection) => projection.column) ?? []),
    ]
    const rows = stagedClient
      .prepare(
        `SELECT ${readColumns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(snapshotTable.table)}`,
      )
      .raw()
      .all() as Array<unknown[]>
    const digest = computeDigest(rows, snapshotTable.primaryKeyIndices, undefined)
    const expected = snapshot.digests.get(snapshotTable.table)
    if (
      expected === undefined ||
      digest.count !== expected.count ||
      digest.sha256 !== expected.sha256
    ) {
      throw new Error(
        `Preservation check failed for legacy table ${snapshotTable.table}: expected ${expected?.count} rows with digest ${expected?.sha256}, staged ${digest.count} rows with digest ${digest.sha256}`,
      )
    }
  }
}

function computeDigest(
  rows: readonly unknown[][],
  primaryKeyIndices: readonly number[],
  projections: readonly CopyTableProjection[] | undefined,
): TableDigest {
  const projectionValues = projections?.map((projection) => serializeScalar(projection.value)) ?? []
  const serializedRows = sortRowsByPrimaryKey(rows, primaryKeyIndices).map((row) =>
    [...row.map(serializeScalar), ...projectionValues].join('\u001f'),
  )
  return {
    count: rows.length,
    sha256: createHash('sha256').update(serializedRows.join('\u001e')).digest('hex'),
  }
}

function sortRowsByPrimaryKey(
  rows: readonly unknown[][],
  primaryKeyIndices: readonly number[],
): readonly unknown[][] {
  return rows.toSorted((left, right) => {
    for (const index of primaryKeyIndices) {
      const result = compareScalars(left[index], right[index])
      if (result !== 0) return result
    }
    return 0
  })
}

function compareScalars(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'bigint' && typeof right === 'bigint') {
    return left < right ? -1 : left > right ? 1 : 0
  }
  const leftText = serializeScalar(left)
  const rightText = serializeScalar(right)
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0
}

function serializeScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Buffer.isBuffer(value)) return `blob:${value.toString('hex')}`
  if (typeof value === 'number') return `num:${value}`
  if (typeof value === 'bigint') return `int:${value}`
  if (typeof value === 'string') return `str:${JSON.stringify(value)}`
  throw new Error(`Unsupported SQLite scalar type: ${typeof value}`)
}

function validateStagedFinalState(client: Database.Database, plan: CurrentMigrationPlan): void {
  const ledger = client
    .prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at, id')
    .all() as Array<{ hash: string; created_at: number }>
  if (ledger.length !== plan.entries.length) {
    throw new ControlMigrationIncompatibilityError(
      'Staged database ledger does not match the current migration manifest',
    )
  }
  for (const [index, row] of ledger.entries()) {
    const expected = plan.entries[index]
    if (
      expected === undefined ||
      row.created_at !== expected.createdAt ||
      row.hash !== expected.hash
    ) {
      throw new ControlMigrationIncompatibilityError(
        'Staged database ledger does not match the current migration manifest',
      )
    }
  }

  const integrity = client.pragma('integrity_check', { simple: true }) as string
  if (integrity !== 'ok') {
    throw new ControlMigrationIncompatibilityError(
      `Staged database integrity check failed: ${integrity}`,
    )
  }
  const foreignKeyViolations = client.prepare('PRAGMA foreign_key_check').all()
  if (foreignKeyViolations.length > 0) {
    throw new ControlMigrationIncompatibilityError('Staged database has foreign key violations')
  }

  const tableRows = client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>
  const tables = new Set(tableRows.map((row) => row.name))
  const missing = BASE_SKELETON_TABLES.filter((table) => !tables.has(table))
  if (missing.length > 0) {
    throw new ControlMigrationIncompatibilityError(
      `Staged database is missing base skeleton tables: ${missing.join(', ')}`,
    )
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}
