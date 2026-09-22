import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  LEGACY_SCHEMA_FINGERPRINT,
  classifyControlLineage,
  computeLegacySchemaFingerprint,
} from '../../legacy-bridge.ts'
import { createLegacy471c10dTestDb } from '../../testing/legacy471c10d.ts'

describe('classifyControlLineage', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-legacy-lineage-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('classifies the exact legacy 471c10d fixture as legacy-471c10d', () => {
    const fixture = createLegacy471c10dTestDb({ path: join(dir, 'legacy.sqlite') })
    try {
      expect(classifyControlLineage(fixture.client)).toEqual({ kind: 'legacy-471c10d' })
    } finally {
      fixture.close()
    }
  })

  it('classifies a database with no tables and no ledger as empty', () => {
    const client = new Database(join(dir, 'empty.sqlite'))
    try {
      expect(classifyControlLineage(client)).toEqual({ kind: 'empty' })
    } finally {
      client.close()
    }
  })

  it('classifies an empty ledger over user tables as incompatible', () => {
    const client = new Database(join(dir, 'ledgerless.sqlite'))
    try {
      client.exec('CREATE TABLE `user` (`id` text PRIMARY KEY NOT NULL)')
      expect(classifyControlLineage(client).kind).toBe('incompatible')
    } finally {
      client.close()
    }
  })

  it('classifies a mutated ledger hash as incompatible', () => {
    const fixture = createLegacy471c10dTestDb({ path: join(dir, 'mutated-hash.sqlite') })
    try {
      fixture.client
        .prepare('UPDATE __drizzle_migrations SET hash = ? WHERE id = 1')
        .run('0'.repeat(64))
      const result = classifyControlLineage(fixture.client)
      expect(result.kind).toBe('incompatible')
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM user').get()).toEqual({
        count: 1,
      })
      expect(classifyControlLineage(fixture.client)).toEqual(result)
    } finally {
      fixture.close()
    }
  })

  it('classifies a mutated ledger created_at as incompatible', () => {
    const fixture = createLegacy471c10dTestDb({ path: join(dir, 'mutated-when.sqlite') })
    try {
      fixture.client
        .prepare('UPDATE __drizzle_migrations SET created_at = created_at + 1 WHERE id = 2')
        .run()
      const result = classifyControlLineage(fixture.client)
      expect(result.kind).toBe('incompatible')
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM user').get()).toEqual({
        count: 1,
      })
      expect(classifyControlLineage(fixture.client)).toEqual(result)
    } finally {
      fixture.close()
    }
  })

  it('classifies a three-row partial legacy prefix as incompatible', () => {
    const fixture = createLegacy471c10dTestDb({ path: join(dir, 'partial.sqlite') })
    try {
      fixture.client.exec('DELETE FROM __drizzle_migrations WHERE id = 4')
      const result = classifyControlLineage(fixture.client)
      expect(result.kind).toBe('incompatible')
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM user').get()).toEqual({
        count: 1,
      })
      expect(classifyControlLineage(fixture.client)).toEqual(result)
    } finally {
      fixture.close()
    }
  })

  it('classifies a forged four-row ledger over a dropped-column schema as incompatible', () => {
    const fixture = createLegacy471c10dTestDb({ path: join(dir, 'forged.sqlite') })
    try {
      fixture.client.pragma('foreign_keys = OFF')
      fixture.client.exec('ALTER TABLE `user` DROP COLUMN `role`')
      const result = classifyControlLineage(fixture.client)
      expect(result.kind).toBe('incompatible')
      expect(computeLegacySchemaFingerprint(fixture.client)).not.toBe(LEGACY_SCHEMA_FINGERPRINT)
    } finally {
      fixture.close()
    }
  })

  it('classifies an extra index on the legacy schema as incompatible', () => {
    const fixture = createLegacy471c10dTestDb({ path: join(dir, 'extra-index.sqlite') })
    try {
      fixture.client.exec('CREATE INDEX `forged_user_name_idx` ON `user` (`name`)')
      const result = classifyControlLineage(fixture.client)
      expect(result.kind).toBe('incompatible')
      expect(computeLegacySchemaFingerprint(fixture.client)).not.toBe(LEGACY_SCHEMA_FINGERPRINT)
    } finally {
      fixture.close()
    }
  })
})
