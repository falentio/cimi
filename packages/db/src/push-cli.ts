import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readControlDatabasePushability } from './client.ts'
import { resolveControlDbPath } from './migrate.ts'

const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

const MIGRATE_TASK = 'vp run --filter @cimi/db migrate'

const controlDatabasePath = resolveControlDbPath()

const pushability = readControlDatabasePushability(controlDatabasePath)

if (pushability.kind === 'populated') {
  console.error(
    `db:push refused: control database ${controlDatabasePath} already holds ` +
      `${String(pushability.userTables.length)} tables (${pushability.userTables.join(', ')}).\n` +
      `drizzle-kit push only initializes an empty prototyping database; run ` +
      `\`${MIGRATE_TASK}\` instead.`,
  )
  process.exitCode = 1
} else {
  process.exitCode = runDrizzleKitPush()
}

function runDrizzleKitPush(): number {
  const result = spawnSync(
    process.execPath,
    [resolveDrizzleKitBin(), 'push', '--config', 'drizzle.config.ts'],
    { cwd: PACKAGE_ROOT, stdio: 'inherit' },
  )

  if (result.error !== undefined) {
    console.error(`db:push could not start drizzle-kit: ${result.error.message}`)

    return 1
  }

  return result.status ?? 1
}

function resolveDrizzleKitBin(): string {
  const bin = join(dirname(fileURLToPath(import.meta.resolve('drizzle-kit'))), 'bin.cjs')

  if (existsSync(bin)) return bin

  return join(PACKAGE_ROOT, 'node_modules', '.bin', 'drizzle-kit')
}
