import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url))
const dataDirectory = process.env['CIMI_DATA_DIR'] ?? '.cimi'
const databasePath =
  process.env['CIMI_CONTROL_DB_PATH'] ?? resolve(workspaceRoot, dataDirectory, 'control.sqlite')

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: databasePath,
  },
})
