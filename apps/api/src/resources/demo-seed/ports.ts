import type { RetentionResolver } from '@cimi/kernel'
import type { EventKind } from '@cimi/utils'
import type { ScalarValue } from '../collection-policy/evaluator.ts'

export interface DemoSitePort {
  createDemoSite(input: {
    readonly organizationId: string
    readonly ownerUserId: string
  }): Promise<{ readonly siteId: string }>
  releaseDemoSite(input: { readonly siteId: string }): Promise<void>
}

interface DemoSeedEventCommon {
  readonly eventId: string
  readonly kind: EventKind
  readonly occurrenceTime: string
  readonly visitorId: string
  readonly analyticsSessionId: string
  readonly properties: Readonly<Record<string, ScalarValue>>
}

export type DemoSeedEvent = DemoSeedEventCommon &
  (
    | {
        readonly kind: 'page_view'
        readonly pageViewId: string
        readonly pagePath: string
        readonly referrer: string | null
      }
    | { readonly kind: 'custom_event'; readonly name: string }
    | {
        readonly kind: 'outbound'
        readonly destination: string
        readonly name: string | null
      }
    | {
        readonly kind: 'performance'
        readonly name: string
        readonly value: number
        readonly unit: string | null
      }
    | {
        readonly kind: 'error'
        readonly name: string
        readonly code: string | null
        readonly message: string | null
      }
  )

export interface DemoSeedJournalPort {
  appendGenerated(input: {
    readonly siteId: string
    readonly events: readonly DemoSeedEvent[]
  }): Promise<number>
}

export type DemoSeedRetentionPort = RetentionResolver
