import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, type Db } from '../../client.ts'
import {
  applyLegacy471c10dLedger,
  applyLegacy471c10dSchema,
  createLegacy471c10dTestDb,
  seedLegacy471c10dDataset,
} from '../../testing/legacy471c10d.ts'

export const CURRENT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url))

export function createLegacyFileDb(dir: string, filename = 'control.sqlite'): string {
  const path = join(dir, filename)
  const fixture = createLegacy471c10dTestDb({ path })
  fixture.close()
  return path
}

export function createLegacyMemoryDb(): Db {
  const db = createDb({ path: ':memory:' })
  try {
    applyLegacy471c10dSchema(db.$client)
    applyLegacy471c10dLedger(db.$client)
    seedLegacy471c10dDataset(db.$client)
    return db
  } catch (error) {
    db.$client.close()
    throw error
  }
}

export function createCorruptedMigrationsFolder(dir: string): string {
  const folder = join(dir, 'corrupted-migrations')
  mkdirSync(join(folder, 'meta'), { recursive: true })
  for (const name of readdirSync(CURRENT_MIGRATIONS_FOLDER)) {
    if (name.endsWith('.sql'))
      copyFileSync(join(CURRENT_MIGRATIONS_FOLDER, name), join(folder, name))
  }
  copyFileSync(
    join(CURRENT_MIGRATIONS_FOLDER, 'meta/_journal.json'),
    join(folder, 'meta/_journal.json'),
  )
  writeFileSync(
    join(folder, '0015_normalize_legacy_public_dashboard.sql'),
    'SELECT * FROM __table_that_does_not_exist__',
  )
  return folder
}

export function readLedger(db: Db): readonly { hash: string; created_at: number }[] {
  return db.$client
    .prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at, id')
    .all() as Array<{ hash: string; created_at: number }>
}

export function countRows(db: Db, table: string): number {
  const row = db.$client.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as {
    count: number
  }
  return row.count
}

export function stagingArtifacts(dir: string): readonly string[] {
  return readdirSync(dir).filter(
    (name) => name.startsWith('legacy-bridge-') || name.includes('.recovery.'),
  )
}

export const TMP_ROOT = tmpdir()
