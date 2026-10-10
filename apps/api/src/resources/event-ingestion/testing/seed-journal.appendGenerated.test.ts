import { describe, expect, it } from 'vitest'
import { mock, type MockProxy } from 'vitest-mock-extended'
import type { CollectionPolicyService } from '../../collection-policy/service.ts'
import type { DemoSeedEvent } from '../../demo-seed/ports.ts'
import { AcceptanceSeedJournal } from '../seed-journal.ts'
import type { AcceptanceCandidate, AcceptanceRepository, AppendOutcome } from '../repository.ts'

const now = new Date('2026-04-01T12:00:00.000Z')

type KindEvent<K extends DemoSeedEvent['kind']> = Extract<DemoSeedEvent, { kind: K }>

function base(eventId: string) {
  return {
    eventId,
    occurrenceTime: '2026-01-02T03:04:05.000Z',
    visitorId: 'ste_1-v3',
    analyticsSessionId: 'ste_1-s7',
    properties: {},
  }
}

function pageView(overrides: Partial<KindEvent<'page_view'>> = {}): DemoSeedEvent {
  return {
    ...base('ste_1-e0'),
    kind: 'page_view',
    pageViewId: 'ste_1-pv0',
    pagePath: '/pricing',
    referrer: null,
    ...overrides,
  }
}

function performance(
  eventId: string,
  overrides: Partial<KindEvent<'performance'>> = {},
): DemoSeedEvent {
  return {
    ...base(eventId),
    kind: 'performance',
    name: 'largest_contentful_paint',
    value: 120,
    unit: 'ms',
    ...overrides,
  }
}

function error(eventId: string, overrides: Partial<KindEvent<'error'>> = {}): DemoSeedEvent {
  return {
    ...base(eventId),
    kind: 'error',
    name: 'NetworkError',
    code: 'E_TIMEOUT',
    message: 'Failed to fetch',
    ...overrides,
  }
}

function customEvent(
  eventId: string,
  overrides: Partial<KindEvent<'custom_event'>> = {},
): DemoSeedEvent {
  return {
    ...base(eventId),
    kind: 'custom_event',
    name: 'signup',
    ...overrides,
  }
}

function outbound(eventId: string, overrides: Partial<KindEvent<'outbound'>> = {}): DemoSeedEvent {
  return {
    ...base(eventId),
    kind: 'outbound',
    destination: 'https://acme.io',
    name: null,
    ...overrides,
  }
}

function createJournal(repository: AcceptanceRepository) {
  const collectionPolicy = mock<Pick<CollectionPolicyService, 'effectiveRevisionId'>>()
  collectionPolicy.effectiveRevisionId.mockResolvedValue('cpr_site_1')

  return new AcceptanceSeedJournal({
    acceptance: repository,
    collectionPolicy,
    clock: () => now,
  })
}

function candidatesOf(
  repository: MockProxy<AcceptanceRepository>,
): (readonly AcceptanceCandidate[])[] {
  return repository.append.mock.calls.map(([candidates]) => candidates)
}

describe('AcceptanceSeedJournal.appendGenerated', () => {
  it('maps the plain event shape onto an accepted candidate under the site policy', async () => {
    const repository = mock<AcceptanceRepository>()
    repository.lastReplaySequence.mockResolvedValue(0)
    repository.append.mockResolvedValue([{ status: 'accepted' }])
    const journal = createJournal(repository)

    await expect(
      journal.appendGenerated({
        siteId: 'ste_1',
        events: [pageView({ referrer: 'https://example.com/' })],
      }),
    ).resolves.toBe(1)
    expect(repository.append).toHaveBeenCalledWith([
      {
        siteId: 'ste_1',
        event: {
          eventId: 'ste_1-e0',
          kind: 'page_view',
          occurrenceTime: '2026-01-02T03:04:05.000Z',
          identifiedUserId: null,
          anonymousIdentityId: null,
          properties: {},
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          deviceType: null,
          browser: null,
          os: null,
          country: null,
          botPolicyOutcome: 'included',
          pageViewId: 'ste_1-pv0',
          pagePath: '/pricing',
          referrer: 'https://example.com/',
        },
        receiptTime: now.toISOString(),
        late: true,
        policyRevisionId: 'cpr_site_1',
        payloadFingerprint: expect.any(String),
        visitorId: 'ste_1-v3',
        analyticsSessionId: 'ste_1-s7',
        replaySequence: 1,
      },
    ])
  })

  it('stamps a receipt time now, so a ninety-day-old event is late', async () => {
    const repository = mock<AcceptanceRepository>()
    repository.append.mockResolvedValue([{ status: 'accepted' }])
    const journal = createJournal(repository)

    await journal.appendGenerated({ siteId: 'ste_1', events: [pageView()] })

    const candidate = candidatesOf(repository)[0]?.[0]

    expect(candidate?.receiptTime).toBe(now.toISOString())
    expect(candidate?.late).toBe(true)
  })

  it('assigns replay sequences globally after the high-water mark', async () => {
    const repository = mock<AcceptanceRepository>()
    repository.lastReplaySequence.mockResolvedValue(41)
    repository.append.mockResolvedValue([
      { status: 'accepted' },
      { status: 'accepted' },
      { status: 'accepted' },
    ])
    const journal = createJournal(repository)

    await expect(
      journal.appendGenerated({
        siteId: 'ste_1',
        events: [pageView({ eventId: 'ste_1-e0' }), performance('ste_1-e1'), error('ste_1-e2')],
      }),
    ).resolves.toBe(3)
    expect(candidatesOf(repository)[0]?.map((candidate) => candidate.replaySequence)).toEqual([
      42, 43, 44,
    ])
  })

  it('leaves the page view id off every other kind', async () => {
    const repository = mock<AcceptanceRepository>()
    repository.append.mockResolvedValue([])
    const journal = createJournal(repository)

    await journal.appendGenerated({
      siteId: 'ste_1',
      events: [customEvent('ste_1-e1'), outbound('ste_1-e2')],
    })

    const events = candidatesOf(repository)[0]?.map((candidate) => candidate.event) ?? []

    expect(events.map((event) => event.kind)).toEqual(['custom_event', 'outbound'])
    expect(events.map((event) => 'pageViewId' in event)).toEqual([false, false])
  })

  it('re-plans the replay sequence on a conflict, at most twice', async () => {
    const repository = mock<AcceptanceRepository>()
    repository.lastReplaySequence.mockResolvedValueOnce(0).mockResolvedValue(500)
    const conflict: AppendOutcome = { status: 'conflict' }
    repository.append
      .mockResolvedValueOnce([conflict, conflict])
      .mockResolvedValueOnce([conflict, conflict])
      .mockResolvedValueOnce([{ status: 'accepted' }, { status: 'accepted' }])
    const journal = createJournal(repository)

    await expect(
      journal.appendGenerated({
        siteId: 'ste_1',
        events: [
          pageView({ eventId: 'ste_1-e0' }),
          pageView({ eventId: 'ste_1-e1', pageViewId: 'ste_1-pv1' }),
        ],
      }),
    ).resolves.toBe(2)
    expect(repository.lastReplaySequence).toHaveBeenCalledTimes(3)
    expect(
      candidatesOf(repository).map((candidates) =>
        candidates.map((candidate) => candidate.replaySequence),
      ),
    ).toEqual([
      [1, 2],
      [501, 502],
      [501, 502],
    ])
  })

  it('gives up after the second re-plan and reports what landed', async () => {
    const repository = mock<AcceptanceRepository>()
    repository.lastReplaySequence.mockResolvedValue(0)
    repository.append.mockResolvedValue([{ status: 'conflict' }, { status: 'accepted' }])
    const journal = createJournal(repository)

    await expect(
      journal.appendGenerated({
        siteId: 'ste_1',
        events: [
          pageView({ eventId: 'ste_1-e0' }),
          pageView({ eventId: 'ste_1-e1', pageViewId: 'ste_1-pv1' }),
        ],
      }),
    ).resolves.toBe(1)
    expect(repository.append).toHaveBeenCalledTimes(3)
  })
})
