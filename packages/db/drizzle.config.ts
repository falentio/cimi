import { defineConfig } from 'drizzle-kit'
import { resolveControlDbPath } from './src/control-db-path.ts'

const databasePath = resolveControlDbPath()

export const controlDatabaseUrl = databasePath

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: databasePath,
  },
})
