import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import { migrateControlDb } from '../../migrate.ts'
import { TUser } from '../../schema/index.ts'

describe('createDb + migrateControlDb', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-db-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('migrates idempotently and round-trips a user row', async () => {
    const path = join(dir, 'control.sqlite')
    const db = createDb({ path })

    expect(db.$client.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.$client.pragma('synchronous', { simple: true })).toBe(2)
    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.$client.pragma('busy_timeout', { simple: true })).toBe(5000)
    expect(db.$client.pragma('wal_autocheckpoint', { simple: true })).toBe(1000)

    migrateControlDb(db)
    migrateControlDb(db)

    const migrationRows = db.$client
      .prepare('SELECT hash, created_at FROM __drizzle_migrations')
      .all() as Array<{ hash: string; created_at: number }>
    expect(migrationRows).toHaveLength(1)
    expect(migrationRows[0]?.hash).toMatch(/^[a-f0-9]{64}$/)

    const tableRows = db.$client
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
    expect(tableRows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'accepted_event',
        'backup_artifact',
        'backup_cleanup_stage',
        'backup_operation',
        'cohort',
        'cohort_version',
        'collection_policy_revision',
        'event_acceptance_journal',
        'event_custom',
        'event_error',
        'event_outbound',
        'event_page_view',
        'event_payload',
        'event_performance',
        'event_property',
        'funnel',
        'funnel_version',
        'goal',
        'goal_version',
        'identity_link',
        'identity_profile',
        'identity_profile_epoch',
        'identity_redaction',
        'installation',
        'invitation',
        'membership',
        'organization',
        'public_dashboard',
        'retention_cleanup_checkpoint',
        'retention_cleanup_run',
        'retention_policy',
        'site',
        'site_lifecycle_operation',
      ]),
    )

    const now = new Date()
    const user = {
      id: 'user-1',
      name: 'Kevin',
      email: 'kevin@example.com',
      emailVerified: true,
      image: null,
      role: null,
      banned: null,
      banReason: null,
      banExpires: null,
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(TUser).values(user)

    const rows = await db.select().from(TUser)
    const [row] = rows

    expect(rows).toHaveLength(1)
    expect(row).toEqual(user)
    expect(row?.emailVerified).toBe(true)
    expect(row?.createdAt.getTime()).toBe(now.getTime())
    expect(row?.updatedAt.getTime()).toBe(now.getTime())

    closeDb(db)
    expect(() => closeDb(db)).not.toThrow()
  })
})
