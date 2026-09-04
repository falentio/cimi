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
  ControlMigrationIncompatibilityError,
  migrateControlDb,
  migrateControlDbAtPath,
  resolveControlDbPath,
  validateBaseSchema,
  validateControlMigrationHistory,
} from './migrate.ts'
export {
  ANALYTICS_DB_FILENAME,
  ANALYTICS_PROJECTION_VERSION,
  ANALYTICS_REQUIRED_TABLES,
  createAnalyticsDb,
  type AnalyticsDb,
  type CreateAnalyticsDbOptions,
} from './duckdb/index.ts'
