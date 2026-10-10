import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateControlDbAtPath } from '../../migrate.ts'

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

const PUSH_CLI = fileURLToPath(new URL('../../push-cli.ts', import.meta.url))

describe('push-cli', () => {
  let dir: string
  let controlPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cimi-push-cli-'))
    controlPath = join(dir, 'control.sqlite')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('refuses to push a migrated control database and leaves the schema untouched', () => {
    migrateControlDbAtPath(controlPath)
    const masterBefore = readMaster(controlPath)

    const result = spawnSync(process.execPath, [PUSH_CLI], {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, CIMI_CONTROL_DB_PATH: controlPath },
      encoding: 'utf8',
    })

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('vp run --filter @cimi/db migrate')
    expect(readMaster(controlPath)).toEqual(masterBefore)
  })
})

function readMaster(path: string): Array<{ name: string; type: string }> {
  const client = new Database(path, { readonly: true, fileMustExist: true })

  try {
    // SAFETY: better-sqlite3 returns any; row shape fixed by the static SQL.
    const rows = client
      .prepare('SELECT type, name FROM sqlite_master ORDER BY type, name')
      .all() as Array<{ type: string; name: string }>

    return rows.map((row) => ({ name: row.name, type: row.type }))
  } finally {
    client.close()
  }
}
