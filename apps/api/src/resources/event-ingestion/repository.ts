import { SEvent } from '@cimi/contract'
import type { InferOutput } from 'valibot'
import type { ScalarValue } from '../collection-policy/evaluator.ts'
import type { DerivedAttribution } from './attribution.ts'

export type EventInput = InferOutput<typeof SEvent>

export type NormalizedEvent =
  | (NormalizedEventCommon & {
      readonly kind: 'page_view'
      readonly pageViewId: string
      readonly pagePath: string | null
      readonly referrer: string | null
    })
  | (NormalizedEventCommon & { readonly kind: 'custom_event'; readonly name: string })
  | (NormalizedEventCommon & {
      readonly kind: 'outbound'
      readonly destination: string
      readonly name: string | null
    })
  | (NormalizedEventCommon & {
      readonly kind: 'performance'
      readonly name: string
      readonly value: number
      readonly unit: string | null
    })
  | (NormalizedEventCommon & {
      readonly kind: 'error'
      readonly name: string
      readonly code: string | null
      readonly message: string | null
    })

interface NormalizedEventCommon {
  readonly eventId: string
  readonly occurrenceTime: string
  readonly identifiedUserId: string | null
  readonly anonymousIdentityId: string | null
  readonly properties: Readonly<Record<string, ScalarValue>>
  readonly utmSource: string | null
  readonly utmMedium: string | null
  readonly utmCampaign: string | null
  readonly deviceType: string | null
  readonly browser: string | null
  readonly os: string | null
  readonly country: string | null
  readonly botPolicyOutcome: 'included' | 'recorded_excluded'
}

export interface AcceptanceCandidate {
  readonly siteId: string
  readonly event: NormalizedEvent
  readonly receiptTime: string
  readonly late: boolean
  readonly policyRevisionId: string
  readonly payloadFingerprint: string
  readonly visitorId: string | null
  readonly analyticsSessionId: string | null
  readonly sessionStartedAt?: string | undefined
  readonly replaySequence: number
}

export interface AcceptedEventRecord {
  readonly receiptTime: string
  readonly payloadFingerprint: string
}

export interface StoredIdentitySession {
  readonly visitorId: string
  readonly analyticsSessionId: string
  readonly receiptTime: string
  readonly sessionStartTime: string
  readonly attribution: DerivedAttribution
}

export type AppendOutcome =
  | { readonly status: 'accepted' }
  | { readonly status: 'duplicate'; readonly receiptTime: string }
  | { readonly status: 'conflict' }

export interface AcceptanceRepository {
  findByEventId(siteId: string, eventId: string): Promise<AcceptedEventRecord | undefined>
  findIdentitySession(input: {
    readonly siteId: string
    readonly anonymousIdentityId: string | null
    readonly identifiedUserId: string | null
  }): Promise<StoredIdentitySession | undefined>
  findByPageViewId(siteId: string, pageViewId: string): Promise<AcceptedEventRecord | undefined>
  lastReplaySequence(): Promise<number>
  append(candidates: readonly AcceptanceCandidate[]): Promise<readonly AppendOutcome[]>
  deleteExpired(input: { readonly siteId: string; readonly receiptCutoff: Date }): Promise<number>
  deleteExpiredReplayMaterial(input: {
    readonly siteId: string
    readonly receiptCutoff: Date
  }): Promise<number>
  walBytes?(): number
}
