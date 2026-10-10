import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveControlDbPath } from './migrate.ts'
import { readControlDatabaseTables } from './push.ts'

const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

const MIGRATE_TASK = 'vp run --filter @cimi/db migrate'

const controlDatabasePath = resolveControlDbPath()

const refusal = describeRefusal(controlDatabasePath)

if (refusal !== undefined) {
  console.error(refusal)
  process.exitCode = 1
} else {
  process.exitCode = runDrizzleKitPush()
}

function describeRefusal(path: string): string | undefined {
  let tables: string[]

  try {
    tables = readControlDatabaseTables(path)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    return `db:push refused: control database ${path} could not be read: ${reason}.`
  }

  if (tables.length === 0) return undefined

  const shown = tables.slice(0, 10).join(', ')
  const rest = tables.length > 10 ? `, and ${String(tables.length - 10)} more` : ''

  return (
    `db:push refused: control database ${path} already holds ` +
    `${String(tables.length)} tables (${shown}${rest}).\n` +
    `drizzle-kit push only initializes an empty prototyping database; run ` +
    `\`${MIGRATE_TASK}\` instead.`
  )
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
  return join(dirname(fileURLToPath(import.meta.resolve('drizzle-kit'))), 'bin.cjs')
}
