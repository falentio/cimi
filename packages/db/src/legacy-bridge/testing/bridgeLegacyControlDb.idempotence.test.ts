import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import { migrateControlDb } from '../../migrate.ts'
import {
  countRows,
  createLegacyFileDb,
  createLegacyMemoryDb,
  readLedger,
} from './bridgeTestSupport.ts'

describe('bridgeLegacyControlDb.idempotence', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-bridge-idempotence-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('treats a second migration of the same file-backed handle as a no-op', () => {
    const path = createLegacyFileDb(dir)
    const db = createDb({ path })
    try {
      migrateControlDb(db)
      const firstLedger = readLedger(db)
      expect(firstLedger).toHaveLength(16)

      migrateControlDb(db)

      expect(readLedger(db)).toEqual(firstLedger)
      expect(countRows(db, 'user')).toBe(1)
      expect(countRows(db, 'accepted_event')).toBe(1)
    } finally {
      closeDb(db)
    }
  })

  it('keeps data intact when a file-backed database is reopened and migrated again', () => {
    const path = createLegacyFileDb(dir)
    const first = createDb({ path })
    try {
      migrateControlDb(first)
    } finally {
      closeDb(first)
    }

    const reopened = createDb({ path })
    try {
      migrateControlDb(reopened)
      expect(readLedger(reopened)).toHaveLength(16)
      expect(countRows(reopened, 'user')).toBe(1)
      expect(countRows(reopened, 'site')).toBe(2)
      expect(
        reopened.$client
          .prepare('SELECT enabled, public_identifier FROM public_dashboard ORDER BY site_id')
          .all(),
      ).toEqual([
        { enabled: 0, public_identifier: null },
        { enabled: 0, public_identifier: null },
      ])
    } finally {
      closeDb(reopened)
    }
  })

  it('treats a second migration of the same in-memory handle as a no-op', () => {
    const db = createLegacyMemoryDb()
    try {
      migrateControlDb(db)
      const firstLedger = readLedger(db)
      expect(firstLedger).toHaveLength(16)

      migrateControlDb(db)

      expect(readLedger(db)).toEqual(firstLedger)
      expect(countRows(db, 'user')).toBe(1)
    } finally {
      closeDb(db)
    }
  })
})
