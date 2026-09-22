import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import { migrateControlDb, validateBaseSchema } from '../../migrate.ts'
import { TUser } from '../../schema/index.ts'
import { loadCurrentMigrationPlan } from '../../migration-plan.ts'
import {
  countRows,
  createLegacyFileDb,
  createLegacyMemoryDb,
  CURRENT_MIGRATIONS_FOLDER,
  readLedger,
} from './bridgeTestSupport.ts'

describe('bridgeLegacyControlDb.upgrade', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-bridge-upgrade-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('upgrades a file-backed legacy control database to the current line', () => {
    const path = createLegacyFileDb(dir)
    const db = createDb({ path })
    try {
      migrateControlDb(db)

      const plan = loadCurrentMigrationPlan(CURRENT_MIGRATIONS_FOLDER)
      const ledger = readLedger(db)
      expect(ledger).toHaveLength(16)
      expect(ledger).toEqual(
        plan.entries.map((entry) => ({ hash: entry.hash, created_at: entry.createdAt })),
      )

      for (const table of ['auth_organization', 'auth_member', 'auth_invitation', 'hello']) {
        expect(countRows(db, table)).toBe(0)
      }

      const issuerColumn = db.$client.prepare("PRAGMA table_info('account')").all() as Array<{
        name: string
        notnull: number
      }>
      expect(issuerColumn.find((column) => column.name === 'issuer')?.notnull).toBe(1)
      expect(
        db.$client
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'account_issuer_accountId_uidx'",
          )
          .get(),
      ).toBeDefined()

      expect(
        db.$client.prepare('SELECT authority_organization_id FROM organization').all(),
      ).toEqual([{ authority_organization_id: null }])

      expect(db.$client.prepare('SELECT id, name, email FROM user').all()).toEqual([
        { id: 'legacy-user-1', name: 'Legacy User', email: 'legacy-user@example.com' },
      ])
      expect(db.$client.prepare('SELECT id, token, user_id FROM session').all()).toEqual([
        { id: 'legacy-session-1', token: 'legacy-session-token', user_id: 'legacy-user-1' },
      ])
      expect(db.$client.prepare('SELECT id, identifier, value FROM verification').all()).toEqual([
        {
          id: 'legacy-verification-1',
          identifier: 'legacy-user@example.com',
          value: 'legacy-verification-value',
        },
      ])
      expect(db.$client.prepare('SELECT id, name, hostname FROM site ORDER BY id').all()).toEqual([
        { id: 'legacy-site-1', name: 'Legacy Site One', hostname: 'one.legacy.example.com' },
        { id: 'legacy-site-2', name: 'Legacy Site Two', hostname: 'two.legacy.example.com' },
      ])
      expect(
        db.$client.prepare('SELECT id, name, owner_user_id, is_personal FROM organization').all(),
      ).toEqual([
        {
          id: 'legacy-org-1',
          name: 'Legacy Organization',
          owner_user_id: 'legacy-user-1',
          is_personal: 0,
        },
      ])
      expect(
        db.$client.prepare('SELECT organization_id, user_id, role FROM membership').all(),
      ).toEqual([{ organization_id: 'legacy-org-1', user_id: 'legacy-user-1', role: 'owner' }])
      expect(
        db.$client
          .prepare('SELECT event_pk, site_id, event_id, event_kind FROM accepted_event')
          .all(),
      ).toEqual([
        {
          event_pk: 1,
          site_id: 'legacy-site-1',
          event_id: 'legacy-event-1',
          event_kind: 'custom_event',
        },
      ])
      expect(
        db.$client.prepare('SELECT event_pk, canonical_payload_json FROM event_payload').all(),
      ).toEqual([{ event_pk: 1, canonical_payload_json: '{"name":"legacy_event"}' }])
      expect(db.$client.prepare('SELECT id FROM installation').all()).toEqual([
        { id: 'legacy-installation-1' },
      ])
      expect(
        db.$client.prepare('SELECT id, installation_id FROM collection_policy_revision').all(),
      ).toEqual([{ id: 'legacy-collection-policy-1', installation_id: 'legacy-installation-1' }])
      expect(db.$client.prepare('SELECT id, status FROM retention_policy').all()).toEqual([
        { id: 'legacy-retention-policy-1', status: 'active' },
      ])
      expect(
        db.$client.prepare('SELECT id, status, site_id FROM retention_cleanup_run').all(),
      ).toEqual([{ id: 'legacy-cleanup-run-1', status: 'queued', site_id: 'legacy-site-1' }])

      expect(
        db.$client
          .prepare(
            'SELECT site_id, enabled, public_identifier, public_identifier_hash FROM public_dashboard ORDER BY site_id',
          )
          .all(),
      ).toEqual([
        {
          site_id: 'legacy-site-1',
          enabled: 0,
          public_identifier: null,
          public_identifier_hash: '9f2c4e1a',
        },
        {
          site_id: 'legacy-site-2',
          enabled: 0,
          public_identifier: null,
          public_identifier_hash: '7b3d8f5c',
        },
      ])

      validateBaseSchema(db)
    } finally {
      closeDb(db)
    }
  })

  it('upgrades an in-memory legacy control database on the same handle', async () => {
    const db = createLegacyMemoryDb()
    try {
      migrateControlDb(db)

      const ledger = readLedger(db)
      expect(ledger).toHaveLength(16)
      for (const table of ['auth_organization', 'auth_member', 'auth_invitation']) {
        expect(countRows(db, table)).toBe(0)
      }
      expect(
        db.$client
          .prepare(
            'SELECT site_id, enabled, public_identifier, public_identifier_hash FROM public_dashboard ORDER BY site_id',
          )
          .all(),
      ).toEqual([
        {
          site_id: 'legacy-site-1',
          enabled: 0,
          public_identifier: null,
          public_identifier_hash: '9f2c4e1a',
        },
        {
          site_id: 'legacy-site-2',
          enabled: 0,
          public_identifier: null,
          public_identifier_hash: '7b3d8f5c',
        },
      ])

      const users = await db.select().from(TUser)
      expect(users).toHaveLength(1)
      expect(users[0]?.id).toBe('legacy-user-1')

      validateBaseSchema(db)
    } finally {
      closeDb(db)
    }
  })
})
