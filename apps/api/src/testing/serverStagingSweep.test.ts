import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrphanedControlDatabaseError } from '@cimi/db'
import { createApiServerApp } from '../server.ts'

describe('createApiServerApp restore staging sweep', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cimi-server-sweep-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function boot(dataDir: string, controlDbPath: string) {
    return createApiServerApp({
      env: {
        BETTER_AUTH_SECRET: 'test-secret-1234567890',
        CIMI_DATA_DIR: dataDir,
        CIMI_CONTROL_DB_PATH: controlDbPath,
      },
    })
  }

  it('sweeps orphaned staging files before serving', async () => {
    const dataDir = join(dir, 'data')
    mkdirSync(dataDir, { recursive: true })
    const controlDbPath = join(dataDir, 'control.sqlite')

    const staging = [
      'control.sqlite.tmp.0123456789abcdef',
      'control.sqlite.tmp.0123456789abcdef-wal',
      'control.sqlite.tmp.0123456789abcdef-shm',
    ]

    for (const name of staging) writeFileSync(join(dataDir, name), 'x')

    const app = await boot(dataDir, controlDbPath)

    try {
      expect(readdirSync(dataDir).filter((name) => name.includes('.tmp.'))).toEqual([])
      expect(existsSync(controlDbPath)).toBe(true)
    } finally {
      await app.close()
    }
  })

  it('refuses to boot over an orphaned crash-recovery copy', async () => {
    const dataDir = join(dir, 'data')
    mkdirSync(dataDir, { recursive: true })
    const controlDbPath = join(dataDir, 'control.sqlite')
    const recovery = 'control.sqlite.previous.fedcba9876543210'

    writeFileSync(join(dataDir, recovery), 'the only copy of the database')

    await expect(boot(dataDir, controlDbPath)).rejects.toThrow(OrphanedControlDatabaseError)

    expect(existsSync(controlDbPath)).toBe(false)
    expect(existsSync(join(dataDir, recovery))).toBe(true)
  })
})
