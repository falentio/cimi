import { describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import { migrateControlDb } from '../../migrate.ts'
import { createTestAnalyticsDb } from '../../testing/index.ts'
import type { AnalyticsDb, AnalyticsProjectionSnapshot, Db } from '../../index.ts'

const NOW = Date.parse('2026-09-05T00:00:00.000Z')

const SITE_ID = 'ste-1'

const CHUNK_ROWS = 2_000

const VOLUME_EVENTS = 2_001

const INTERLEAVED_EVENTS = 10_000

const READS_DURING_APPEND = 8

function epochMs(milliseconds: number): bigint {
  return BigInt(milliseconds)
}

async function readFacts(analytics: AnalyticsDb, siteId: string) {
  const visitors = await analytics.readWindowed((reader) =>
    reader.read(
      `SELECT site_id, visitor_id, identity_kind, epoch_ms(first_seen_at) AS first_seen_at,
              epoch_ms(last_seen_at) AS last_seen_at, profile_id
       FROM visitors WHERE site_id = ? ORDER BY visitor_id`,
      [siteId],
    ),
  )

  const sessions = await analytics.readWindowed((reader) =>
    reader.read(
      `SELECT site_id, session_id, visitor_id, identified_user_id, epoch_ms(started_at) AS started_at,
              epoch_ms(ended_at) AS ended_at, entry_page, referrer, utm_source, utm_medium,
              utm_campaign, device, browser, operating_system, country, region, city
       FROM analytics_sessions WHERE site_id = ? ORDER BY session_id`,
      [siteId],
    ),
  )

  return { visitors, sessions }
}

function checkpointState(snapshot: AnalyticsProjectionSnapshot) {
  const checkpoint = snapshot.checkpoint

  return {
    factCardinality: snapshot.factCardinality,
    projectedAcceptanceSequence: checkpoint?.projectedAcceptanceSequence ?? null,
    projectedFactCardinality: checkpoint?.projectedFactCardinality ?? null,
    projectionGeneration: checkpoint?.projectionGeneration ?? null,
    occurrenceCoveredFrom: checkpoint?.occurrenceCoveredFrom?.getTime() ?? null,
    occurrenceCoveredThrough: checkpoint?.occurrenceCoveredThrough?.getTime() ?? null,
    readiness: checkpoint?.readiness ?? null,
  }
}

async function readReportEventIds(analytics: AnalyticsDb, siteId: string, events: number) {
  const report = await analytics.readReportData({
    siteId,
    from: new Date(NOW - 1_000),
    toExclusive: new Date(NOW + events * 1_000),
  })

  return report.events.map((event) => event.eventId)
}

describe('AnalyticsDb.appendProjectedEvents', () => {
  it('creates a checkpoint for a fresh Site whose cardinality equals the live count', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()

    try {
      seedJournal(controlDb)

      const before = await analytics.readProjectionSnapshot({ siteId: SITE_ID })

      expect(before.checkpoint).toBeNull()
      expect(before.factCardinality).toBe(0)

      const result = await analytics.appendProjectedEvents({ controlDb, siteId: SITE_ID })

      const snapshot = await analytics.readProjectionSnapshot({ siteId: SITE_ID })

      expect(result).toMatchObject({
        appendedEventCount: 4,
        appendedPropertyCount: 3,
        appendedVisitorCount: 2,
        appendedSessionCount: 2,
        chunkCount: 1,
        projectedReplaySequence: 5,
        projectedFactCardinality: 4,
        projectionGeneration: 1,
      })
      expect(snapshot.factCardinality).toBe(4)
      expect(snapshot.checkpoint?.projectedFactCardinality).toBe(4)
      expect(snapshot.checkpoint?.projectedAcceptanceSequence).toBe(5)
      expect(snapshot.checkpoint?.readiness).toBe('ready')
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('derives the same visitors and sessions as rebuild, row for row', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const appended = await createTestAnalyticsDb()
    const rebuilt = await createTestAnalyticsDb()

    try {
      seedJournal(controlDb)

      await appended.appendProjectedEvents({ controlDb, siteId: SITE_ID })
      await rebuilt.rebuild({ controlDb })

      const fromAppend = await readFacts(appended, SITE_ID)
      const fromRebuild = await readFacts(rebuilt, SITE_ID)

      expect(fromAppend.visitors).toEqual(fromRebuild.visitors)
      expect(fromAppend.sessions).toEqual(fromRebuild.sessions)

      expect(fromAppend.visitors).toEqual([
        expect.objectContaining({
          visitor_id: 'vis-1',
          identity_kind: 'identified',
          profile_id: 'profile-1',
          first_seen_at: epochMs(NOW),
          last_seen_at: epochMs(NOW + 1_000),
        }),
        expect.objectContaining({
          visitor_id: 'vis-2',
          identity_kind: 'anonymous',
          profile_id: null,
        }),
      ])
      expect(fromAppend.sessions).toEqual([
        expect.objectContaining({
          session_id: 'ses-1',
          started_at: epochMs(NOW),
          ended_at: epochMs(NOW + 1_000),
          entry_page: null,
          referrer: null,
        }),
        expect.objectContaining({ session_id: 'ses-2', entry_page: '/b' }),
      ])
    } finally {
      await appended.close()
      await rebuilt.close()
      closeDb(controlDb)
    }
  })

  it('merges occurrence coverage across chunks instead of resetting it', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const appended = await createTestAnalyticsDb()
    const rebuilt = await createTestAnalyticsDb()

    try {
      seedVolume(controlDb, VOLUME_EVENTS)

      const result = await appended.appendProjectedEvents({
        controlDb,
        siteId: SITE_ID,
        chunkRows: CHUNK_ROWS,
      })

      await rebuilt.rebuild({ controlDb })

      const snapshot = await appended.readProjectionSnapshot({ siteId: SITE_ID })

      expect(result.chunkCount).toBe(2)
      expect(result.appendedEventCount).toBe(VOLUME_EVENTS)
      expect(snapshot.checkpoint?.occurrenceCoveredFrom?.getTime()).toBe(NOW)
      expect(snapshot.checkpoint?.occurrenceCoveredThrough?.getTime()).toBe(
        NOW + (VOLUME_EVENTS - 1) * 1_000,
      )

      const fromAppend = await readFacts(appended, SITE_ID)
      const fromRebuild = await readFacts(rebuilt, SITE_ID)

      expect(fromAppend.visitors).toEqual(fromRebuild.visitors)
      expect(fromAppend.sessions).toEqual(fromRebuild.sessions)
    } finally {
      await appended.close()
      await rebuilt.close()
      closeDb(controlDb)
    }
  })

  it('advances the generation by the max over both generation tables plus one', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()

    try {
      seedJournal(controlDb)
      await analytics.rebuild({ controlDb })

      await analytics.readWindowed(async (reader) => {
        await reader.read('DELETE FROM projection_generations WHERE site_id = ?', [SITE_ID])
        await reader.read(
          'INSERT INTO projection_generations (site_id, projection_generation, updated_at) VALUES (?, ?, current_timestamp)',
          [SITE_ID, 5],
        )

        return null
      })

      const result = await analytics.appendProjectedEvents({ controlDb, siteId: SITE_ID })
      const snapshot = await analytics.readProjectionSnapshot({ siteId: SITE_ID })

      expect(result.projectionGeneration).toBe(6)
      expect(snapshot.checkpoint?.projectionGeneration).toBe(6)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('keeps the store ready before, during and after the append', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()

    try {
      seedVolume(controlDb, VOLUME_EVENTS)

      const readyBefore = await analytics.ready()

      const appendPromise = analytics.appendProjectedEvents({
        controlDb,
        siteId: SITE_ID,
        chunkRows: CHUNK_ROWS,
      })

      const readyDuring = await analytics.ready()

      const [duringFirst, duringSecond] = await Promise.all([
        analytics.readProjectionSnapshot({ siteId: SITE_ID }),
        analytics.readProjectionSnapshot({ siteId: SITE_ID }),
      ])

      await appendPromise

      expect(readyBefore).toBe(true)
      expect(readyDuring).toBe(true)
      expect(await analytics.ready()).toBe(true)

      for (const snapshot of [duringFirst, duringSecond]) {
        if (snapshot.checkpoint === null) continue

        expect(snapshot.checkpoint.readiness).toBe('ready')
        expect(snapshot.checkpoint.projectedFactCardinality).toBe(snapshot.factCardinality)
      }
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('serializes a read issued mid-append behind the append, not inside its transaction', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const interleaved = await createTestAnalyticsDb()
    const clean = await createTestAnalyticsDb()

    try {
      seedVolume(controlDb, INTERLEAVED_EVENTS)

      const appendPromise = interleaved.appendProjectedEvents({
        controlDb,
        siteId: SITE_ID,
        chunkRows: CHUNK_ROWS,
      })

      const snapshotsDuringAppend: AnalyticsProjectionSnapshot[] = []

      for (let read = 0; read < READS_DURING_APPEND; read += 1) {
        snapshotsDuringAppend.push(await interleaved.readProjectionSnapshot({ siteId: SITE_ID }))
      }

      const result = await appendPromise

      const cleanResult = await clean.appendProjectedEvents({
        controlDb,
        siteId: SITE_ID,
        chunkRows: CHUNK_ROWS,
      })

      expect(result.chunkCount).toBeGreaterThan(1)
      expect(result.appendedEventCount).toBe(INTERLEAVED_EVENTS)
      expect(result.appendedEventCount).toBe(cleanResult.appendedEventCount)

      for (const snapshot of snapshotsDuringAppend) {
        expect(snapshot.factCardinality).toBe(snapshot.checkpoint?.projectedFactCardinality ?? 0)
      }

      expect(await readFacts(interleaved, SITE_ID)).toEqual(await readFacts(clean, SITE_ID))
      expect(await readReportEventIds(interleaved, SITE_ID, INTERLEAVED_EVENTS)).toEqual(
        await readReportEventIds(clean, SITE_ID, INTERLEAVED_EVENTS),
      )
      expect(
        checkpointState(await interleaved.readProjectionSnapshot({ siteId: SITE_ID })),
      ).toEqual(checkpointState(await clean.readProjectionSnapshot({ siteId: SITE_ID })))
    } finally {
      await interleaved.close()
      await clean.close()
      closeDb(controlDb)
    }
  })

  it('leaves the cursor and the cardinality unmoved when a chunk fails', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()

    try {
      seedVolume(controlDb, CHUNK_ROWS)
      await analytics.rebuild({ controlDb })

      const before = await analytics.readProjectionSnapshot({ siteId: SITE_ID })

      expect(before.checkpoint?.projectedAcceptanceSequence).toBe(CHUNK_ROWS)
      expect(before.factCardinality).toBe(CHUNK_ROWS)

      seedAmbiguousIdentityEvent(controlDb)

      await expect(
        analytics.appendProjectedEvents({
          controlDb,
          siteId: SITE_ID,
          chunkRows: CHUNK_ROWS,
        }),
      ).rejects.toThrow('Ambiguous identity Profile Epoch')

      const after = await analytics.readProjectionSnapshot({ siteId: SITE_ID })

      expect(after.checkpoint?.projectedAcceptanceSequence).toBe(CHUNK_ROWS)
      expect(after.factCardinality).toBe(CHUNK_ROWS)
      expect(after.checkpoint?.projectedFactCardinality).toBe(CHUNK_ROWS)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('changes nothing when a committed chunk is replayed', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()

    try {
      seedJournal(controlDb)

      const first = await analytics.appendProjectedEvents({ controlDb, siteId: SITE_ID })
      const afterFirst = await readFacts(analytics, SITE_ID)
      const snapshotFirst = await analytics.readProjectionSnapshot({ siteId: SITE_ID })

      const second = await analytics.appendProjectedEvents({ controlDb, siteId: SITE_ID })

      expect(second.appendedEventCount).toBe(0)
      expect(second.appendedPropertyCount).toBe(0)
      expect(second.chunkCount).toBe(1)

      expect(await readFacts(analytics, SITE_ID)).toEqual(afterFirst)

      const snapshotSecond = await analytics.readProjectionSnapshot({ siteId: SITE_ID })

      expect(snapshotSecond.factCardinality).toBe(snapshotFirst.factCardinality)
      expect(snapshotSecond.checkpoint?.projectedAcceptanceSequence).toBe(
        snapshotFirst.checkpoint?.projectedAcceptanceSequence,
      )
      expect(second.projectionGeneration).toBe(first.projectionGeneration + 1)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('refuses to append while a rebuild is running', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()

    try {
      seedJournal(controlDb)

      const rebuildPromise = analytics.rebuild({ controlDb })

      await expect(analytics.appendProjectedEvents({ controlDb, siteId: SITE_ID })).rejects.toThrow(
        'Analytics database rebuild is already running',
      )

      await rebuildPromise

      expect(await analytics.ready()).toBe(true)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('stops instead of failing when a rebuild moves the cursor ahead mid-append', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()

    try {
      seedJournal(controlDb)

      const appendPromise = analytics.appendProjectedEvents({
        controlDb,
        siteId: SITE_ID,
        chunkRows: CHUNK_ROWS,
      })

      await analytics.rebuild({ controlDb })

      await expect(appendPromise).resolves.toMatchObject({ chunkCount: expect.any(Number) })

      const snapshot = await analytics.readProjectionSnapshot({ siteId: SITE_ID })

      expect(snapshot.checkpoint?.projectedFactCardinality).toBe(snapshot.factCardinality)
      expect(await analytics.ready()).toBe(true)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
  it('asserts the chunk size into the 2000 to 5000 band', async () => {
    const controlDb = createDb({ path: ':memory:' })
    const analytics = await createTestAnalyticsDb()

    try {
      seedJournal(controlDb)

      await expect(
        analytics.appendProjectedEvents({ controlDb, siteId: SITE_ID, chunkRows: 1_999 }),
      ).rejects.toThrow(/chunkRows/)
      await expect(
        analytics.appendProjectedEvents({ controlDb, siteId: SITE_ID, chunkRows: 5_001 }),
      ).rejects.toThrow(/chunkRows/)
      await expect(
        analytics.appendProjectedEvents({ controlDb, siteId: SITE_ID, chunkRows: 2_000 }),
      ).resolves.toMatchObject({ chunkCount: 1 })
      await expect(
        analytics.appendProjectedEvents({ controlDb, siteId: SITE_ID, chunkRows: 5_000 }),
      ).resolves.toMatchObject({ chunkCount: 1 })
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
})

function seedJournal(controlDb: Db): void {
  migrateControlDb(controlDb)
  seedBaseRows(controlDb)
  seedIdentity(controlDb)

  const insertEvent = controlDb.$client.prepare(
    'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, anonymous_identity_id, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )

  const insertPageView = controlDb.$client.prepare(
    'INSERT INTO event_page_view (event_pk, page_path, referrer) VALUES (?, ?, ?)',
  )

  const events: {
    eventPk: number
    eventId: string
    eventKind: string
    occurrenceTime: number
    receiptTime: number
    visitorId: string
    sessionId: string
    replaySequence: number
    projectionState: string
    pagePath?: string | null
    referrer?: string | null
  }[] = [
    {
      eventPk: 1,
      eventId: 'evt-1',
      eventKind: 'custom_event',
      occurrenceTime: NOW + 1_000,
      receiptTime: NOW + 1_000,
      visitorId: 'vis-1',
      sessionId: 'ses-1',
      replaySequence: 1,
      projectionState: 'pending',
    },
    {
      eventPk: 2,
      eventId: 'evt-2',
      eventKind: 'page_view',
      occurrenceTime: NOW + 1_000,
      receiptTime: NOW + 1_000,
      visitorId: 'vis-1',
      sessionId: 'ses-1',
      replaySequence: 2,
      projectionState: 'pending',
      pagePath: '/a',
      referrer: 'https://later.example',
    },
    {
      eventPk: 3,
      eventId: 'evt-3',
      eventKind: 'custom_event',
      occurrenceTime: NOW,
      receiptTime: NOW,
      visitorId: 'vis-1',
      sessionId: 'ses-1',
      replaySequence: 3,
      projectionState: 'pending',
    },
    {
      eventPk: 4,
      eventId: 'evt-4',
      eventKind: 'page_view',
      occurrenceTime: NOW + 2_000,
      receiptTime: NOW + 2_000,
      visitorId: 'vis-2',
      sessionId: 'ses-2',
      replaySequence: 4,
      projectionState: 'pending',
      pagePath: '/b',
      referrer: null,
    },
    {
      eventPk: 5,
      eventId: 'evt-5',
      eventKind: 'page_view',
      occurrenceTime: NOW + 3_000,
      receiptTime: NOW + 3_000,
      visitorId: 'vis-1',
      sessionId: 'ses-1',
      replaySequence: 5,
      projectionState: 'failed',
      pagePath: '/never',
      referrer: null,
    },
  ]

  for (const event of events) {
    insertEvent.run(
      event.eventPk,
      SITE_ID,
      event.eventId,
      event.eventKind,
      event.occurrenceTime,
      event.receiptTime,
      event.visitorId,
      event.visitorId,
      event.sessionId,
      'pol-1',
      event.replaySequence,
      'fingerprint-' + event.eventPk,
      event.projectionState,
      event.occurrenceTime,
    )

    if (event.pagePath !== undefined) {
      insertPageView.run(event.eventPk, event.pagePath, event.referrer ?? null)
    }
  }

  const insertProperty = controlDb.$client.prepare(
    'INSERT INTO event_property (event_pk, property_key, value_type, string_value, number_value, boolean_value) VALUES (?, ?, ?, ?, ?, ?)',
  )

  insertProperty.run(1, 'plan', 'string', 'pro', null, null)
  insertProperty.run(1, 'count', 'number', null, 2, null)
  insertProperty.run(1, 'trial', 'boolean', null, null, 1)
}

function seedVolume(controlDb: Db, count: number): void {
  migrateControlDb(controlDb)
  seedBaseRows(controlDb)

  const insertEvent = controlDb.$client.prepare(
    'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )

  for (let index = 0; index < count; index += 1) {
    insertEvent.run(
      index + 1,
      SITE_ID,
      'evt-' + (index + 1),
      'custom_event',
      NOW + index * 1_000,
      NOW + index * 1_000,
      'vis-' + (index % 3),
      'ses-' + (index % 2),
      'pol-1',
      index + 1,
      'fingerprint-' + (index + 1),
      'pending',
      NOW + index * 1_000,
    )
  }
}

function seedAmbiguousIdentityEvent(controlDb: Db): void {
  controlDb.$client
    .prepare(
      'INSERT INTO identity_profile (profile_id, site_id, identified_user_id, status, profile_epoch, first_seen_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('profile-ambiguous', SITE_ID, 'identified-ambiguous', 'active', 1, NOW, NOW, NOW, NOW)

  const insertEpoch = controlDb.$client.prepare(
    'INSERT INTO identity_profile_epoch (profile_id, site_id, identified_user_id, epoch, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )

  insertEpoch.run(
    'profile-ambiguous',
    SITE_ID,
    'identified-ambiguous',
    1,
    'active',
    NOW - 1_000,
    null,
  )
  insertEpoch.run(
    'profile-ambiguous',
    SITE_ID,
    'identified-ambiguous',
    2,
    'redacted',
    NOW - 1_000,
    NOW + 10_000_000,
  )

  const insertVolumeEvent = controlDb.$client.prepare(
    'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, identified_user_id, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )

  const later = (offset: number) => NOW + (CHUNK_ROWS + offset) * 1_000

  insertVolumeEvent.run(
    CHUNK_ROWS + 1,
    SITE_ID,
    'evt-clean',
    'custom_event',
    later(1),
    later(1),
    null,
    'vis-next',
    'ses-next',
    'pol-1',
    CHUNK_ROWS + 1,
    'fingerprint-next',
    'pending',
    NOW,
  )
  insertVolumeEvent.run(
    CHUNK_ROWS + 2,
    SITE_ID,
    'evt-ambiguous',
    'custom_event',
    later(2),
    later(2),
    'identified-ambiguous',
    'vis-ambiguous',
    'ses-ambiguous',
    'pol-1',
    CHUNK_ROWS + 2,
    'fingerprint-ambiguous',
    'pending',
    NOW,
  )
}

function seedBaseRows(controlDb: Db): void {
  controlDb.$client
    .prepare(
      'INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('user-1', 'User', 'user@example.com', 1, NOW, NOW)
  controlDb.$client
    .prepare(
      'INSERT INTO organization (id, name, owner_user_id, is_personal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('org-1', 'Organization', 'user-1', 0, NOW, NOW)
  controlDb.$client
    .prepare(
      'INSERT INTO site (id, organization_id, name, hostname, ingestion_identifier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(SITE_ID, 'org-1', 'Site', 'example.com', 'ing-1', NOW, NOW)
  controlDb.$client
    .prepare(
      'INSERT INTO installation (id, status, data_directory_ready, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run('ins-1', 'ready', 1, NOW, NOW)
  controlDb.$client
    .prepare(
      'INSERT INTO collection_policy_revision (id, installation_id, scope, version, policy_json, effective_from, committed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('pol-1', 'ins-1', 'installation', 1, '{}', NOW, NOW, NOW)
}

function seedIdentity(controlDb: Db): void {
  controlDb.$client
    .prepare(
      'INSERT INTO identity_profile (profile_id, site_id, identified_user_id, status, profile_epoch, first_seen_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('profile-1', SITE_ID, 'identified-1', 'active', 1, NOW, NOW, NOW, NOW)
  controlDb.$client
    .prepare(
      'INSERT INTO identity_profile_epoch (profile_id, site_id, identified_user_id, epoch, status, started_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('profile-1', SITE_ID, 'identified-1', 1, 'active', NOW - 1_000)
  controlDb.$client
    .prepare(
      'INSERT INTO identity_link (id, site_id, profile_id, profile_epoch, anonymous_identity_id, analytics_session_id, effective_from, linked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('link-1', SITE_ID, 'profile-1', 1, 'vis-1', 'ses-1', NOW - 1_000, NOW - 1_000)
}
