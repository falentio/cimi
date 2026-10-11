import { describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import { migrateControlDb } from '../../migrate.ts'
import { readEvents, readProperties } from '../projection-source.ts'

describe('readEvents', () => {
  it('narrows the journal to one Site, a replay cursor, and a row limit', () => {
    const controlDb = createDb({ path: ':memory:' })

    try {
      seedJournal(controlDb)

      const all = readEvents(controlDb)
      const scoped = readEvents(controlDb, { siteId: 'ste-1' })
      const after = readEvents(controlDb, { siteId: 'ste-1', afterReplaySequence: 2 })
      const limited = readEvents(controlDb, { siteId: 'ste-1', limit: 1 })

      expect(all.map((event) => event.eventId)).toEqual(['evt-1', 'evt-2', 'evt-3', 'evt-4'])
      expect(scoped.map((event) => event.replaySequence)).toEqual([1, 3])
      expect(after.map((event) => event.replaySequence)).toEqual([3])
      expect(limited.map((event) => event.replaySequence)).toEqual([1])
    } finally {
      closeDb(controlDb)
    }
  })

  it('keeps the whole journal when no scope narrows it', () => {
    const controlDb = createDb({ path: ':memory:' })

    try {
      seedJournal(controlDb)

      expect(readEvents(controlDb, {}).map((event) => event.eventId)).toEqual([
        'evt-1',
        'evt-2',
        'evt-3',
        'evt-4',
      ])
    } finally {
      closeDb(controlDb)
    }
  })
})

describe('readProperties', () => {
  it('returns no rows for an empty event_pk list', () => {
    const controlDb = createDb({ path: ':memory:' })

    try {
      seedJournal(controlDb)

      expect(readProperties(controlDb, [])).toEqual([])
    } finally {
      closeDb(controlDb)
    }
  })

  it('reads only the properties belonging to the given events', () => {
    const controlDb = createDb({ path: ':memory:' })

    try {
      seedJournal(controlDb)

      const properties = readProperties(controlDb, [2, 4])

      expect(properties).toEqual([
        {
          eventPk: 2,
          propertyKey: 'plan',
          valueType: 'string',
          stringValue: 'ste-2',
          numberValue: null,
          booleanValue: null,
        },
        {
          eventPk: 4,
          propertyKey: 'plan',
          valueType: 'string',
          stringValue: 'ste-2',
          numberValue: null,
          booleanValue: null,
        },
      ])
    } finally {
      closeDb(controlDb)
    }
  })
})

function seedJournal(controlDb: ReturnType<typeof createDb>): void {
  migrateControlDb(controlDb)

  const now = Date.parse('2026-09-05T00:00:00.000Z')

  controlDb.$client
    .prepare(
      'INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('user-1', 'User', 'user@example.com', 1, now, now)
  controlDb.$client
    .prepare(
      'INSERT INTO organization (id, name, owner_user_id, is_personal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('org-1', 'Organization', 'user-1', 0, now, now)

  const insertSite = controlDb.$client.prepare(
    'INSERT INTO site (id, organization_id, name, hostname, ingestion_identifier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )

  insertSite.run('ste-1', 'org-1', 'Site', 'example.com', 'ing-1', now, now)
  insertSite.run('ste-2', 'org-1', 'Site 2', 'example.org', 'ing-2', now, now)
  controlDb.$client
    .prepare(
      'INSERT INTO installation (id, status, data_directory_ready, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run('ins-1', 'ready', 1, now, now)
  controlDb.$client
    .prepare(
      'INSERT INTO collection_policy_revision (id, installation_id, scope, version, policy_json, effective_from, committed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('pol-1', 'ins-1', 'installation', 1, '{}', now, now, now)

  const insertEvent = controlDb.$client.prepare(
    'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )

  for (const [eventPk, siteId, replaySequence] of [
    [1, 'ste-1', 1],
    [2, 'ste-2', 2],
    [3, 'ste-1', 3],
    [4, 'ste-2', 4],
  ] as const) {
    insertEvent.run(
      eventPk,
      siteId,
      'evt-' + eventPk,
      'custom_event',
      now + eventPk,
      now + eventPk,
      'vis-' + siteId,
      'ses-' + siteId,
      'pol-1',
      replaySequence,
      'fingerprint-' + eventPk,
      'pending',
      now + eventPk,
    )
  }

  const insertProperty = controlDb.$client.prepare(
    'INSERT INTO event_property (event_pk, property_key, value_type, string_value) VALUES (?, ?, ?, ?)',
  )

  for (const [eventPk, siteId] of [
    [1, 'ste-1'],
    [2, 'ste-2'],
    [3, 'ste-1'],
    [4, 'ste-2'],
  ] as const) {
    insertProperty.run(eventPk, 'plan', 'string', siteId)
  }
}
