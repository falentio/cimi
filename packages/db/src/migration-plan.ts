import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord } from '@cimi/utils'

export class ControlMigrationIncompatibilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ControlMigrationIncompatibilityError'
  }
}

export const BASE_SKELETON_TABLES = [
  'installation',
  'retention_policy',
  'retention_effective_cutoff',
  'site_tombstone',
  'backup_restore_reference',
  'event_acceptance_journal',
] as const

export interface MigrationManifestEntry {
  readonly tag: string
  readonly createdAt: number
  readonly hash: string
}

export interface CurrentMigrationPlan {
  readonly folder: string
  readonly entries: readonly MigrationManifestEntry[]
  readonly baseline: MigrationManifestEntry
  readonly final: MigrationManifestEntry
}

export function loadCurrentMigrationPlan(migrationsFolder: string): CurrentMigrationPlan {
  const entries = loadMigrationManifest(migrationsFolder)
  const baseline = entries[0]
  const final = entries[entries.length - 1]
  if (baseline === undefined || final === undefined) {
    throw new Error('Control migration journal is invalid')
  }
  return { folder: migrationsFolder, entries, baseline, final }
}

export function loadMigrationManifest(migrationsFolder: string): readonly MigrationManifestEntry[] {
  const parsed: unknown = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  )
  if (!isRecord(parsed) || !Array.isArray(parsed['entries'])) {
    throw new Error('Control migration journal is invalid')
  }

  return parsed['entries'].map((entry) => {
    if (!isRecord(entry) || typeof entry['tag'] !== 'string' || typeof entry['when'] !== 'number') {
      throw new Error('Control migration journal entry is invalid')
    }
    const sql = readFileSync(join(migrationsFolder, `${entry['tag']}.sql`))
    return {
      tag: entry['tag'],
      createdAt: entry['when'],
      hash: createHash('sha256').update(sql).digest('hex'),
    }
  })
}
