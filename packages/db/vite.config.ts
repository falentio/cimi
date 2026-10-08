import { defineConfig } from 'vite-plus'

const dbEnv = ['CIMI_CONTROL_DB_PATH', 'CIMI_DATA_DIR']

export default defineConfig({
  run: {
    tasks: {
      'db:check': { command: 'drizzle-kit check --config drizzle.config.ts', env: dbEnv },
      'db:generate': { command: 'drizzle-kit generate --config drizzle.config.ts', cache: false },
      'db:push': { command: 'drizzle-kit push --config drizzle.config.ts', cache: false },
      'db:studio': { command: 'drizzle-kit studio --config drizzle.config.ts', cache: false },
      migrate: { command: 'node src/migrate-cli.ts', cache: false },
    },
  },
})
