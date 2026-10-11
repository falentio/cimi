import { describe, expect, it } from 'vitest'
import type { DuckDBValue } from '@duckdb/node-api'
import {
  createFactFoldState,
  foldProjectedEvent,
  foldSessionRows,
  foldVisitorRows,
  seedFactFoldState,
} from '../projection-fold.ts'
import type { ProjectedEventRow } from '../projection-source.ts'

function event(
  overrides: Partial<ProjectedEventRow> &
    Pick<ProjectedEventRow, 'visitorId' | 'analyticsSessionId' | 'occurrenceTime'>,
): ProjectedEventRow {
  return {
    eventPk: 0,
    siteId: 'ste-1',
    eventId: 'evt',
    eventKind: 'page_view',
    receiptTime: 0,
    late: 0,
    anonymousIdentityId: null,
    identifiedUserId: null,
    botPolicyOutcome: 'included',
    policyRevisionId: 'pol-1',
    replaySequence: 0,
    payloadFingerprint: 'fingerprint',
    projectionState: 'pending',
    projectedAt: null,
    pagePath: null,
    referrer: null,
    name: null,
    destination: null,
    value: null,
    unit: null,
    code: null,
    message: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    deviceType: null,
    browserType: null,
    operatingSystem: null,
    country: null,
    canonicalPayloadJson: null,
    profileId: null,
    ...overrides,
  }
}

describe('foldProjectedEvent', () => {
  it('lets the earliest event overwrite entry page and attribution unconditionally', () => {
    const state = createFactFoldState()

    foldProjectedEvent(
      state,
      event({
        eventId: 'evt-later',
        replaySequence: 2,
        occurrenceTime: 10_000,
        pagePath: '/a',
        referrer: 'https://later.example',
        visitorId: 'vis-1',
        analyticsSessionId: 'ses-1',
        deviceType: 'desktop',
      }),
    )
    foldProjectedEvent(
      state,
      event({
        eventId: 'evt-earlier',
        replaySequence: 1,
        occurrenceTime: 5_000,
        pagePath: null,
        referrer: null,
        visitorId: 'vis-1',
        analyticsSessionId: 'ses-1',
        deviceType: null,
      }),
    )

    expect(foldSessionRows(state)).toEqual([
      expect.objectContaining({
        sessionId: 'ses-1',
        startedAt: 5_000,
        endedAt: 10_000,
        entryPage: null,
        referrer: null,
        device: null,
      }),
    ])
  })

  it('fills a null session field from a later event but never overwrites an earlier one', () => {
    const state = createFactFoldState()

    foldProjectedEvent(
      state,
      event({
        eventId: 'evt-earlier',
        occurrenceTime: 5_000,
        pagePath: '/a',
        visitorId: 'vis-1',
        analyticsSessionId: 'ses-1',
      }),
    )
    foldProjectedEvent(
      state,
      event({
        eventId: 'evt-later',
        occurrenceTime: 10_000,
        pagePath: '/b',
        referrer: 'https://later.example',
        visitorId: 'vis-1',
        analyticsSessionId: 'ses-1',
      }),
    )

    expect(foldSessionRows(state)).toEqual([
      expect.objectContaining({
        entryPage: '/a',
        referrer: 'https://later.example',
        startedAt: 5_000,
        endedAt: 10_000,
      }),
    ])
  })

  it('carries the profile id onto the visitor and identifies it', () => {
    const state = createFactFoldState()

    foldProjectedEvent(
      state,
      event({
        eventId: 'evt-1',
        occurrenceTime: 5_000,
        identifiedUserId: 'user-1',
        profileId: 'profile-1',
        visitorId: 'vis-1',
        analyticsSessionId: 'ses-1',
      }),
    )
    foldProjectedEvent(
      state,
      event({
        eventId: 'evt-2',
        occurrenceTime: 10_000,
        visitorId: 'vis-1',
        analyticsSessionId: 'ses-1',
      }),
    )

    expect(foldVisitorRows(state)).toEqual([
      {
        siteId: 'ste-1',
        visitorId: 'vis-1',
        identityKind: 'identified',
        profileId: 'profile-1',
        firstSeenAt: 5_000,
        lastSeenAt: 10_000,
      },
    ])
  })

  it('drops the profile id when two profiles collide on one visitor', () => {
    const state = createFactFoldState()

    for (const [eventId, profileId] of [
      ['evt-1', 'profile-1'],
      ['evt-2', 'profile-2'],
    ] as const) {
      foldProjectedEvent(
        state,
        event({
          eventId,
          occurrenceTime: 5_000,
          identifiedUserId: 'user-' + profileId,
          profileId,
          visitorId: 'vis-1',
          analyticsSessionId: 'ses-1',
        }),
      )
    }

    expect(foldVisitorRows(state)).toEqual([
      expect.objectContaining({ identityKind: 'identified', profileId: null }),
    ])
  })
})

describe('seedFactFoldState', () => {
  const visitorSeedRow = {
    site_id: 'ste-1',
    visitor_id: 'vis-1',
    identity_kind: 'identified',
    first_seen_at: 5_000,
    last_seen_at: 10_000,
    profile_id: 'profile-1',
  } satisfies Record<string, DuckDBValue>

  const sessionSeedRow = {
    site_id: 'ste-1',
    session_id: 'ses-1',
    visitor_id: 'vis-1',
    identified_user_id: 'user-1',
    started_at: 5_000,
    ended_at: 10_000,
    entry_page: '/first',
    referrer: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    device: 'mobile',
    browser: null,
    operating_system: null,
    country: null,
  } satisfies Record<string, DuckDBValue>

  it('re-derives a pre-existing session over its whole lifetime', async () => {
    const state = createFactFoldState()

    await seedFactFoldState(state, {
      siteId: 'ste-1',
      visitorIds: ['vis-1'],
      sessionIds: ['ses-1'],
      read: async (sql: string): Promise<readonly Record<string, DuckDBValue>[]> =>
        sql.includes('FROM visitors') ? [visitorSeedRow] : [sessionSeedRow],
    })

    foldProjectedEvent(
      state,
      event({
        eventId: 'evt-later',
        occurrenceTime: 20_000,
        pagePath: '/third',
        visitorId: 'vis-1',
        analyticsSessionId: 'ses-1',
      }),
    )

    expect(foldSessionRows(state)).toEqual([
      expect.objectContaining({
        sessionId: 'ses-1',
        startedAt: 5_000,
        endedAt: 20_000,
        entryPage: '/first',
        device: 'mobile',
      }),
    ])
    expect(foldVisitorRows(state)).toEqual([
      expect.objectContaining({
        visitorId: 'vis-1',
        identityKind: 'identified',
        profileId: 'profile-1',
      }),
    ])
  })

  it('seeds no rows when the chunk touches no existing fact', async () => {
    const state = createFactFoldState()

    await seedFactFoldState(state, {
      siteId: 'ste-1',
      visitorIds: [],
      sessionIds: [],
      read: async (): Promise<readonly Record<string, DuckDBValue>[]> => [],
    })

    expect(foldVisitorRows(state)).toEqual([])
    expect(foldSessionRows(state)).toEqual([])
  })
})
