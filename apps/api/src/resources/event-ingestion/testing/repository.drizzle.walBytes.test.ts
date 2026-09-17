import { statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { closeDb, createDb, migrateControlDb } from '@cimi/db'
import { createApiTestFixture } from '../../../testing/fixture.ts'
import { AcceptanceRepositoryDrizzle } from '../repository.drizzle.ts'

describe('AcceptanceRepositoryDrizzle.walBytes', () => {
  test('walBytes reads the wal file size without side effects', async () => {
    await using fixture = await createApiTestFixture()
    const repository = new AcceptanceRepositoryDrizzle({ db: fixture.db })
    const first = repository.walBytes()
    const second = repository.walBytes()
    expect(first).toBe(0)
    expect(second).toBe(0)
    expect(second).toBe(first)
  })

  test('walBytes reports the file-backed wal size', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-wal-bytes-'))
    const dbPath = join(directory, 'control.sqlite')
    const db = createDb({ path: dbPath })
    try {
      migrateControlDb(db)
      const repository = new AcceptanceRepositoryDrizzle({ db })
      const expected = statSync(`${dbPath}-wal`).size
      expect(expected).toBeGreaterThan(0)
      expect(repository.walBytes()).toBe(expected)
      expect(repository.walBytes()).toBe(expected)
    } finally {
      closeDb(db)
      await rm(directory, { recursive: true, force: true })
    }
  })
})
