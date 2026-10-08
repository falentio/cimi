import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApiServerApp } from '../server.ts'

describe('createApiServerApp restore staging sweep', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cimi-server-sweep-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('sweeps orphaned staging files before serving and keeps a recovery copy', async () => {
    const dataDir = join(dir, 'data')
    mkdirSync(dataDir, { recursive: true })
    const controlDbPath = join(dataDir, 'control.sqlite')

    const staging = [
      'control.sqlite.tmp.0123456789abcdef',
      'control.sqlite.tmp.0123456789abcdef-wal',
      'control.sqlite.tmp.0123456789abcdef-shm',
    ]

    for (const name of staging) writeFileSync(join(dataDir, name), 'x')

    const recovery = 'control.sqlite.previous.fedcba9876543210'
    writeFileSync(join(dataDir, recovery), 'x')

    const app = await createApiServerApp({
      env: {
        BETTER_AUTH_SECRET: 'test-secret-1234567890',
        CIMI_DATA_DIR: dataDir,
        CIMI_CONTROL_DB_PATH: controlDbPath,
      },
    })

    try {
      expect(readdirSync(dataDir).filter((name) => name.includes('.tmp.'))).toEqual([])
      expect(existsSync(join(dataDir, recovery))).toBe(true)
      expect(existsSync(controlDbPath)).toBe(true)
    } finally {
      await app.close()
    }
  })
})
