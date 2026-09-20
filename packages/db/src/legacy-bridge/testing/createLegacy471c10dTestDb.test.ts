import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  LEGACY_471C10D_LEDGER,
  LEGACY_SCHEMA_FINGERPRINT,
  computeLegacySchemaFingerprint,
} from '../../legacy-bridge.ts'
import { createLegacy471c10dTestDb } from '../../testing/legacy471c10d.ts'

const FIXTURE_FOLDER = fileURLToPath(
  new URL('../../testing/fixtures/legacy-471c10d', import.meta.url),
)
const LEGACY_MIGRATION_TAGS = [
  '0000_windy_deathbird',
  '0001_mute_darkhawk',
  '0002_milky_beyonder',
  '0003_nice_gabe_jones',
] as const

describe('createLegacy471c10dTestDb', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-legacy-fixture-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('vendors SQL files whose sha256 equals the pinned ledger hashes', () => {
    LEGACY_MIGRATION_TAGS.forEach((tag, index) => {
      const sql = readFileSync(join(FIXTURE_FOLDER, `${tag}.sql`))
      expect(createHash('sha256').update(sql).digest('hex')).toBe(
        LEGACY_471C10D_LEDGER[index]?.hash,
      )
    })
  })

  it('vendors a journal whose when values equal the pinned ledger createdAt values', () => {
    const parsed: unknown = JSON.parse(
      readFileSync(join(FIXTURE_FOLDER, 'meta/_journal.json'), 'utf8'),
    )
    expect(Array.isArray(parsed)).toBe(false)
    const journal = parsed as { entries: Array<{ tag: string; when: number }> }
    expect(journal.entries.map((entry) => entry.when)).toEqual(
      LEGACY_471C10D_LEDGER.map((entry) => entry.createdAt),
    )
    expect(journal.entries.map((entry) => entry.tag)).toEqual([...LEGACY_MIGRATION_TAGS])
  })

  it('builds the legacy-final schema with the pinned fingerprint and ledger', () => {
    const fixture = createLegacy471c10dTestDb({ path: join(dir, 'legacy.sqlite') })
    try {
      expect(computeLegacySchemaFingerprint(fixture.client)).toBe(LEGACY_SCHEMA_FINGERPRINT)

      const rows = fixture.client
        .prepare('SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id')
        .all() as Array<{ id: number; hash: string; created_at: number }>
      expect(rows).toHaveLength(4)
      rows.forEach((row, index) => {
        const pinned = LEGACY_471C10D_LEDGER[index]
        expect(row.id).toBe(pinned?.id)
        expect(row.hash).toBe(pinned?.hash)
        expect(row.created_at).toBe(pinned?.createdAt)
      })
    } finally {
      fixture.close()
    }
  })

  it('seeds a representative legacy dataset', () => {
    const fixture = createLegacy471c10dTestDb({ path: join(dir, 'seeded.sqlite') })
    try {
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM user').get()).toEqual({
        count: 1,
      })
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM organization').get()).toEqual({
        count: 1,
      })
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM membership').get()).toEqual({
        count: 1,
      })
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM site').get()).toEqual({
        count: 2,
      })
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM accepted_event').get()).toEqual({
        count: 1,
      })
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM event_payload').get()).toEqual({
        count: 1,
      })
      expect(
        fixture.client.prepare('SELECT COUNT(*) AS count FROM retention_policy').get(),
      ).toEqual({ count: 1 })
      expect(
        fixture.client.prepare('SELECT COUNT(*) AS count FROM retention_cleanup_run').get(),
      ).toEqual({ count: 1 })
      expect(
        fixture.client.prepare('SELECT COUNT(*) AS count FROM collection_policy_revision').get(),
      ).toEqual({ count: 1 })
      expect(
        fixture.client.prepare('SELECT public_identifier FROM public_dashboard').get() as {
          public_identifier: string
        },
      ).toMatchObject({ public_identifier: expect.stringMatching(/^legacy-[0-9a-f]+$/) })
      expect(
        fixture.client
          .prepare('SELECT COUNT(*) AS count FROM account WHERE issuer IS NOT NULL')
          .get(),
      ).toEqual({ count: 1 })
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM session').get()).toEqual({
        count: 1,
      })
      expect(fixture.client.prepare('SELECT COUNT(*) AS count FROM verification').get()).toEqual({
        count: 1,
      })
    } finally {
      fixture.close()
    }
  })

  it('exposes a closable raw client', () => {
    const fixture = createLegacy471c10dTestDb({ path: join(dir, 'closeable.sqlite') })
    fixture.close()
    expect(() => fixture.client.prepare('SELECT 1')).toThrow()
  })
})
