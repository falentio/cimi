import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'

/**
 * drizzle-kit push rebuilds the tables of any non-empty database and re-emits each rebuilt
 * table's indexes, so a duplicate CREATE INDEX aborts the statement list mid-run with no
 * wrapping transaction and leaves the database half-pushed. Only an empty database converges.
 */
export function readControlDatabaseTables(controlDatabasePath: string): string[] {
  if (!existsSync(controlDatabasePath)) return []

  return readSqliteMaster(
    controlDatabasePath,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).map((row) => row.name)
}

export function readSqliteMaster(path: string, sql: string): Array<{ name: string; type: string }> {
  const client = new Database(path, { readonly: true, fileMustExist: true })

  try {
    // SAFETY: better-sqlite3 returns any; row shape fixed by the static SQL.
    const rows = client.prepare(sql).all() as Array<{ name: string; type: string }>

    return rows
  } finally {
    client.close()
  }
}
