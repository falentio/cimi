import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { Db } from './client.ts'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url))

export function migrateControlDb(db: Db): void {
  migrate(db, {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsTable: '__drizzle_migrations',
  })
}
