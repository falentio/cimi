import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import { migrateControlDb } from '../../migrate.ts'
import { LEGACY_471C10D_LEDGER } from '../../legacy-bridge.ts'
import {
  countRows,
  createCorruptedMigrationsFolder,
  createLegacyFileDb,
  createLegacyMemoryDb,
  readLedger,
  stagingArtifacts,
} from './bridgeTestSupport.ts'

describe('bridgeLegacyControlDb.atomicity', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-bridge-atomicity-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('leaves the file-backed source untouched when the staged migration fails', () => {
    const path = createLegacyFileDb(dir)
    const db = createDb({ path })
    try {
      const corruptedFolder = createCorruptedMigrationsFolder(join(dir, 'workspace'))
      expect(() => migrateControlDb(db, { migrationsFolder: corruptedFolder })).toThrow()

      const ledger = readLedger(db)
      expect(ledger).toHaveLength(4)
      expect(ledger.map((row) => row.hash)).toEqual(
        LEGACY_471C10D_LEDGER.map((entry) => entry.hash),
      )
      expect(countRows(db, 'user')).toBe(1)
      expect(
        db.$client
          .prepare('SELECT site_id, enabled, public_identifier FROM public_dashboard')
          .all(),
      ).toEqual([
        { site_id: 'legacy-site-1', enabled: 1, public_identifier: 'legacy-9f2c4e1a' },
        { site_id: 'legacy-site-2', enabled: 1, public_identifier: 'legacy-7b3d8f5c' },
      ])
      expect(stagingArtifacts(dirname(path))).toEqual([])

      migrateControlDb(db)

      expect(readLedger(db)).toHaveLength(16)
      expect(countRows(db, 'user')).toBe(1)
    } finally {
      closeDb(db)
    }
  })

  it('keeps an in-memory handle serving old data when the staged migration fails', () => {
    const db = createLegacyMemoryDb()
    try {
      const corruptedFolder = createCorruptedMigrationsFolder(join(dir, 'workspace'))
      expect(() => migrateControlDb(db, { migrationsFolder: corruptedFolder })).toThrow()

      expect(readLedger(db)).toHaveLength(4)
      expect(countRows(db, 'user')).toBe(1)
      expect(db.$client.prepare('SELECT id, token FROM session').all()).toEqual([
        { id: 'legacy-session-1', token: 'legacy-session-token' },
      ])

      migrateControlDb(db)

      expect(readLedger(db)).toHaveLength(16)
      expect(countRows(db, 'user')).toBe(1)
    } finally {
      closeDb(db)
    }
  })

  it('leaves no staging or recovery artifacts beside the source after a failed retry', () => {
    const path = createLegacyFileDb(dir)
    const db = createDb({ path })
    try {
      const corruptedFolder = createCorruptedMigrationsFolder(join(dir, 'workspace'))
      expect(() => migrateControlDb(db, { migrationsFolder: corruptedFolder })).toThrow()
      expect(() => migrateControlDb(db, { migrationsFolder: corruptedFolder })).toThrow()
      expect(stagingArtifacts(dirname(path))).toEqual([])
    } finally {
      closeDb(db)
    }
  })
})
