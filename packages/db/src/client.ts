import { randomBytes } from 'node:crypto'
import { closeSync, fsyncSync, openSync, renameSync, unlinkSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema/index.ts'

export const CONTROL_DB_FILENAME = 'control.sqlite'

export interface CreateDbOptions {
  path: string
}

export function createDb(options: CreateDbOptions) {
  const sqlite = new Database(options.path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = FULL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('wal_autocheckpoint = 1000')
  return drizzle(sqlite, { schema })
}

export type Db = ReturnType<typeof createDb>

const closedDatabases = new WeakSet<Db>()

export function closeDb(db: Db): void {
  if (closedDatabases.has(db)) return
  db.$client.close()
  closedDatabases.add(db)
}

export async function restoreDbFromBackup(input: {
  backupPath: string
  destinationPath: string
}): Promise<void> {
  const tmpPath = `${input.destinationPath}.tmp.${randomBytes(8).toString('hex')}`
  const backup = new Database(input.backupPath, { fileMustExist: true, readonly: true })
  try {
    await backup.backup(tmpPath)
  } finally {
    backup.close()
  }
  const fd = openSync(tmpPath, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  const restored = new Database(tmpPath, { readonly: true })
  try {
    const rows = restored.prepare('PRAGMA integrity_check').all() as Array<{
      integrity_check: string
    }>
    if (rows.length === 0 || rows.some((row) => row.integrity_check !== 'ok')) {
      throw new Error('Restored database integrity check failed')
    }
  } catch (error) {
    try {
      unlinkSync(tmpPath)
    } catch {}
    throw error
  } finally {
    restored.close()
  }
  renameSync(tmpPath, input.destinationPath)
}
