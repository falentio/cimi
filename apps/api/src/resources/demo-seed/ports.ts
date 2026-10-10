import type { RetentionResolver } from '@cimi/kernel'
import type { EventKind } from '@cimi/utils'
import type { ScalarValue } from '../collection-policy/evaluator.ts'

export interface DemoSitePort {
  createDemoSite(input: {
    readonly organizationId: string
    readonly ownerUserId: string
  }): Promise<{ readonly siteId: string }>
}

export interface DemoSeedEvent {
  readonly eventId: string
  readonly kind: EventKind
  readonly occurrenceTime: string
  readonly visitorId: string
  readonly analyticsSessionId: string
  readonly pageViewId: string | null
  readonly pagePath: string | null
  readonly referrer: string | null
  readonly name: string | null
  readonly destination: string | null
  readonly value: number | null
  readonly unit: string | null
  readonly code: string | null
  readonly message: string | null
  readonly properties: Readonly<Record<string, ScalarValue>>
}

export interface DemoSeedJournalPort {
  appendGenerated(input: {
    readonly siteId: string
    readonly events: readonly DemoSeedEvent[]
  }): Promise<number>
}

export type DemoSeedRetentionPort = RetentionResolver
