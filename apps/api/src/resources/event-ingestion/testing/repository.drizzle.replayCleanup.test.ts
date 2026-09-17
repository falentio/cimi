import { describe, expect, test } from 'vitest'
import { SOrganizationCreateOutput, schema } from '@cimi/contract'
import { parse } from 'valibot'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'
import { AcceptanceRepositoryDrizzle } from '../repository.drizzle.ts'

function candidate(
  siteId: string,
  policyRevisionId: string,
  overrides: {
    eventId?: string
    replaySequence?: number
    payloadFingerprint?: string
    receiptTime?: string
    utmSource?: string | null
  } = {},
) {
  return {
    siteId,
    event: {
      eventId: overrides.eventId ?? 'event_race',
      occurrenceTime: '2026-09-01T00:00:00.000Z',
      identifiedUserId: null,
      anonymousIdentityId: null,
      properties: {},
      kind: 'custom_event' as const,
      name: 'checkout',
      utmSource: overrides.utmSource ?? null,
      utmMedium: null,
      utmCampaign: null,
      deviceType: null,
      browser: null,
      os: null,
      country: null,
      botPolicyOutcome: 'included' as const,
    },
    receiptTime: overrides.receiptTime ?? '2026-09-01T00:00:00.000Z',
    late: false,
    policyRevisionId,
    payloadFingerprint: overrides.payloadFingerprint ?? 'fp-1',
    visitorId: null,
    analyticsSessionId: null,
    replaySequence: overrides.replaySequence ?? 1,
  }
}

describe('AcceptanceRepositoryDrizzle.replayCleanup', () => {
  test('replay cleanup removes payloads without losing persisted attribution', async () => {
    await using fixture = await createApiTestFixture()
    const { app, db } = fixture
    const owner = await signUpTestUser(app, 'replay-owner@example.com', 'Replay Owner')
    const initialized = await apiTestRequest(
      app,
      '/installation/initializeInstallation',
      owner.cookie,
      {},
    )
    expect(initialized.status).toBe(201)
    const organizationResponse = await apiTestRequest(
      app,
      '/organization/createOrganization',
      owner.cookie,
      { name: 'Replay Org' },
    )
    const organization = parse(SOrganizationCreateOutput, await organizationResponse.json())
    const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
      organizationId: organization.id,
      name: 'Replay',
      hostname: 'replay.example.com',
    })
    const site = parse(schema.SSiteCreateOutput, await siteResponse.json())
    const revision = db.$client
      .prepare('SELECT id FROM collection_policy_revision LIMIT 1')
      .get() as { id: string }
    const repository = new AcceptanceRepositoryDrizzle({ db })

    expect(
      await repository.append([
        candidate(site.id, revision.id, {
          eventId: 'event-replay',
          replaySequence: 4,
          receiptTime: '2026-01-01T00:00:00.000Z',
          utmSource: 'newsletter',
        }),
      ]),
    ).toEqual([{ status: 'accepted' }])
    expect(
      await repository.deleteExpiredReplayMaterial({
        siteId: site.id,
        receiptCutoff: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ).toBe(1)
    expect(
      db.$client
        .prepare('SELECT utm_source AS utmSource FROM accepted_event WHERE event_id = ?')
        .get('event-replay'),
    ).toEqual({ utmSource: 'newsletter' })
    expect(db.$client.prepare('SELECT event_pk FROM event_payload').all()).toHaveLength(0)
  })
})
