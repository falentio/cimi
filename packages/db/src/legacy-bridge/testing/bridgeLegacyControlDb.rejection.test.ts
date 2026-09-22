import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import { ControlMigrationIncompatibilityError, migrateControlDb } from '../../migrate.ts'
import { countRows, createLegacyFileDb, readLedger } from './bridgeTestSupport.ts'

describe('bridgeLegacyControlDb.rejection', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-bridge-rejection-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('rejects a null account issuer with count and samples and leaves the source untouched', () => {
    const path = createLegacyFileDb(dir)
    const fixture = createDb({ path })
    try {
      fixture.$client
        .prepare('UPDATE account SET issuer = NULL WHERE id = ?')
        .run('legacy-account-1')
    } finally {
      closeDb(fixture)
    }

    const db = createDb({ path })
    try {
      expect(() => migrateControlDb(db)).toThrow(ControlMigrationIncompatibilityError)
      try {
        migrateControlDb(db)
        throw new Error('expected migrateControlDb to throw')
      } catch (error) {
        expect(error).toBeInstanceOf(ControlMigrationIncompatibilityError)
        const message = (error as Error).message
        expect(message).toMatch(/account/)
        expect(message).toMatch(/issuer/)
        expect(message).toContain('1')
        expect(message).toContain('("legacy-account-1", "legacy-user-1")')
      }

      expect(readLedger(db)).toHaveLength(4)
      expect(countRows(db, 'account')).toBe(1)
      expect(db.$client.prepare('SELECT issuer FROM account').all()).toEqual([{ issuer: null }])
      expect(
        db.$client
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'auth_organization'",
          )
          .get(),
      ).toEqual({ count: 0 })
    } finally {
      closeDb(db)
    }
  })

  it('rejects duplicate (issuer, account_id) pairs and leaves the source untouched', () => {
    const path = createLegacyFileDb(dir)
    const fixture = createDb({ path })
    try {
      fixture.$client
        .prepare(
          'INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('legacy-user-2', 'Legacy User Two', 'legacy-user-2@example.com', 1, 1, 1)
      fixture.$client
        .prepare(
          'INSERT INTO account (id, account_id, provider_id, user_id, issuer, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'legacy-account-2',
          'legacy-subject-1',
          'credential',
          'legacy-user-2',
          'https://legacy.example.com',
          1,
          1,
        )
    } finally {
      closeDb(fixture)
    }

    const db = createDb({ path })
    try {
      expect(() => migrateControlDb(db)).toThrow(ControlMigrationIncompatibilityError)
      try {
        migrateControlDb(db)
        throw new Error('expected migrateControlDb to throw')
      } catch (error) {
        const message = (error as Error).message
        expect(message).toMatch(/duplicate/)
        expect(message).toMatch(/issuer/)
        expect(message).toMatch(/account_id/)
      }

      expect(readLedger(db)).toHaveLength(4)
      expect(countRows(db, 'account')).toBe(2)
      expect(countRows(db, 'user')).toBe(2)
    } finally {
      closeDb(db)
    }
  })

  it('rejects a forged legacy ledger without mutating the source', () => {
    const path = createLegacyFileDb(dir)
    const fixture = createDb({ path })
    try {
      fixture.$client
        .prepare('UPDATE __drizzle_migrations SET hash = ? WHERE id = 1')
        .run('0'.repeat(64))
    } finally {
      closeDb(fixture)
    }

    const db = createDb({ path })
    try {
      expect(() => migrateControlDb(db)).toThrow(ControlMigrationIncompatibilityError)

      expect(readLedger(db)).toHaveLength(4)
      expect(countRows(db, 'user')).toBe(1)
      expect(
        db.$client
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'auth_organization'",
          )
          .get(),
      ).toEqual({ count: 0 })
    } finally {
      closeDb(db)
    }
  })

  it('rejects a partial legacy ledger without mutating the source', () => {
    const path = createLegacyFileDb(dir)
    const fixture = createDb({ path })
    try {
      fixture.$client.exec('DELETE FROM __drizzle_migrations WHERE id = 4')
    } finally {
      closeDb(fixture)
    }

    const db = createDb({ path })
    try {
      expect(() => migrateControlDb(db)).toThrow(ControlMigrationIncompatibilityError)

      expect(readLedger(db)).toHaveLength(3)
      expect(countRows(db, 'user')).toBe(1)
      expect(
        db.$client
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'auth_organization'",
          )
          .get(),
      ).toEqual({ count: 0 })
    } finally {
      closeDb(db)
    }
  })

  it('rejects a schema-mutated legacy database without mutating the source', () => {
    const path = createLegacyFileDb(dir)
    const fixture = createDb({ path })
    try {
      fixture.$client.pragma('foreign_keys = OFF')
      fixture.$client.exec('ALTER TABLE "user" DROP COLUMN "role"')
    } finally {
      closeDb(fixture)
    }

    const db = createDb({ path })
    try {
      expect(() => migrateControlDb(db)).toThrow(ControlMigrationIncompatibilityError)

      expect(readLedger(db)).toHaveLength(4)
      expect(
        (db.$client.prepare("PRAGMA table_info('user')").all() as Array<{ name: string }>).some(
          (column) => column.name === 'role',
        ),
      ).toBe(false)
      expect(countRows(db, 'user')).toBe(1)
    } finally {
      closeDb(db)
    }
  })
})
