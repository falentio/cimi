import type { CollectionPolicyService } from '../collection-policy/service.ts'
import type { DemoSeedEvent, DemoSeedJournalPort } from '../demo-seed/ports.ts'
import type { AcceptanceCandidate, AcceptanceRepository, AppendOutcome } from './repository.ts'

export interface AcceptanceSeedJournalDependencies {
  readonly acceptance: AcceptanceRepository
  readonly collectionPolicy: Pick<CollectionPolicyService, 'effectiveRevisionId'>
  readonly clock?: () => Date
}

/** Two re-plans after the first assignment, so a lost uniqueness race ends the batch rather than spinning. */
const MAX_REPLANS = 2

export class AcceptanceSeedJournal implements DemoSeedJournalPort {
  readonly #acceptance: AcceptanceRepository
  readonly #collectionPolicy: Pick<CollectionPolicyService, 'effectiveRevisionId'>
  readonly #clock: () => Date

  constructor({ acceptance, collectionPolicy, clock }: AcceptanceSeedJournalDependencies) {
    this.#acceptance = acceptance
    this.#collectionPolicy = collectionPolicy
    this.#clock = clock ?? (() => new Date())
  }

  async appendGenerated(input: {
    readonly siteId: string
    readonly events: readonly DemoSeedEvent[]
  }): Promise<number> {
    const policyRevisionId = await this.#collectionPolicy.effectiveRevisionId(input.siteId)

    for (let replans = 0; ; replans += 1) {
      const highWater = await this.#acceptance.lastReplaySequence()

      const outcomes = await this.#acceptance.append(
        input.events.map((event, index) =>
          toCandidate({
            siteId: input.siteId,
            event,
            policyRevisionId,
            replaySequence: highWater + index + 1,
            receiptTime: this.#clock().toISOString(),
          }),
        ),
      )

      const appended = outcomes.filter((outcome) => outcome.status !== 'conflict').length

      if (!outcomes.some(isConflict) || replans >= MAX_REPLANS) return appended
    }
  }
}

function isConflict(outcome: AppendOutcome): boolean {
  return outcome.status === 'conflict'
}

function toCandidate(input: {
  readonly siteId: string
  readonly event: DemoSeedEvent
  readonly policyRevisionId: string
  readonly replaySequence: number
  readonly receiptTime: string
}): AcceptanceCandidate {
  const event = input.event
  const occurredAt = new Date(event.occurrenceTime).getTime()
  const receivedAt = new Date(input.receiptTime).getTime()

  return {
    siteId: input.siteId,
    event: toNormalizedEvent(event),
    receiptTime: input.receiptTime,
    late: receivedAt - occurredAt > 15 * 60 * 1000,
    policyRevisionId: input.policyRevisionId,
    payloadFingerprint: fingerprint(event),
    visitorId: event.visitorId,
    analyticsSessionId: event.analyticsSessionId,
    replaySequence: input.replaySequence,
  }
}

function toNormalizedEvent(event: DemoSeedEvent): AcceptanceCandidate['event'] {
  const common = {
    eventId: event.eventId,
    occurrenceTime: event.occurrenceTime,
    identifiedUserId: null,
    anonymousIdentityId: null,
    properties: event.properties,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    deviceType: null,
    browser: null,
    os: null,
    country: null,
    botPolicyOutcome: 'included' as const,
  }

  switch (event.kind) {
    case 'page_view':
      return {
        ...common,
        kind: 'page_view',
        pageViewId: event.pageViewId,
        pagePath: event.pagePath,
        referrer: event.referrer,
      }
    case 'custom_event':
      return { ...common, kind: 'custom_event', name: event.name }
    case 'outbound':
      return {
        ...common,
        kind: 'outbound',
        destination: event.destination,
        name: event.name,
      }
    case 'performance':
      return {
        ...common,
        kind: 'performance',
        name: event.name,
        value: event.value,
        unit: event.unit,
      }
    case 'error':
      return {
        ...common,
        kind: 'error',
        name: event.name,
        code: event.code,
        message: event.message,
      }
  }
}

function fingerprint(event: DemoSeedEvent): string {
  return JSON.stringify([event.eventId, event.kind, event.occurrenceTime, event.visitorId])
}
