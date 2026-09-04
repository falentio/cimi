export {
  CONTROL_DB_FILENAME,
  closeDb,
  createDb,
  restoreDbFromBackup,
  type CreateDbOptions,
  type Db,
} from './client.ts'
export * as schema from './schema/index.ts'
export {
  BASE_SKELETON_TABLES,
  migrateControlDb,
  migrateControlDbAtPath,
  resolveControlDbPath,
  validateBaseSchema,
} from './migrate.ts'
export {
  ANALYTICS_DB_FILENAME,
  ANALYTICS_REQUIRED_TABLES,
  createAnalyticsDb,
  type AnalyticsDb,
  type CreateAnalyticsDbOptions,
} from './duckdb/index.ts'
