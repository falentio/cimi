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
