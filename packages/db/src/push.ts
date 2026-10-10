import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'

/**
 * drizzle-kit push rebuilds the tables of any non-empty database and re-emits each rebuilt
 * table's indexes, so a duplicate CREATE INDEX aborts the statement list mid-run with no
 * wrapping transaction and leaves the database half-pushed. Only an empty database converges.
 */
export function readControlDatabaseTables(controlDatabasePath: string): string[] {
  if (!existsSync(controlDatabasePath)) return []

  const client = new Database(controlDatabasePath, { readonly: true, fileMustExist: true })

  try {
    // SAFETY: better-sqlite3 returns any; row shape fixed by the static SQL.
    const rows = client
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>

    return rows.map((row) => row.name)
  } finally {
    client.close()
  }
}
