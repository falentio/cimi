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

function pageViewCandidate(
  siteId: string,
  policyRevisionId: string,
  overrides: Parameters<typeof candidate>[2] & { pageViewId?: string } = {},
) {
  const base = candidate(siteId, policyRevisionId, overrides)
  return {
    ...base,
    event: {
      ...base.event,
      kind: 'page_view' as const,
      pageViewId: overrides.pageViewId ?? 'page-1',
      pagePath: '/',
      referrer: null,
    },
  }
}

describe('AcceptanceRepositoryDrizzle.appendPageView', () => {
  test('append reconciles pageview duplicates independently of Event ID', async () => {
    await using fixture = await createApiTestFixture()
    const { app, db } = fixture
    const owner = await signUpTestUser(app, 'pageview-owner@example.com', 'Pageview Owner')
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
      { name: 'Pageview Org' },
    )
    const organization = parse(SOrganizationCreateOutput, await organizationResponse.json())
    const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
      organizationId: organization.id,
      name: 'Pageview',
      hostname: 'pageview.example.com',
    })
    const site = parse(schema.SSiteCreateOutput, await siteResponse.json())
    const revision = db.$client
      .prepare('SELECT id FROM collection_policy_revision LIMIT 1')
      .get() as { id: string }
    const repository = new AcceptanceRepositoryDrizzle({ db })

    expect(
      await repository.append([pageViewCandidate(site.id, revision.id, { eventId: 'event-1' })]),
    ).toEqual([{ status: 'accepted' }])
    expect(
      await repository.append([
        pageViewCandidate(site.id, revision.id, {
          eventId: 'event-2',
          replaySequence: 2,
        }),
      ]),
    ).toEqual([{ status: 'duplicate', receiptTime: '2026-09-01T00:00:00.000Z' }])
    expect(
      await repository.append([
        pageViewCandidate(site.id, revision.id, {
          eventId: 'event-3',
          replaySequence: 3,
          payloadFingerprint: 'different',
        }),
      ]),
    ).toEqual([{ status: 'conflict' }])
  })
})
