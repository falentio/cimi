import { SEvent } from '@cimi/contract'
import type { InferOutput } from 'valibot'
import type { ScalarValue } from '../collection-policy/evaluator.ts'

export type EventInput = InferOutput<typeof SEvent>

export type NormalizedEvent =
  | (NormalizedEventCommon & {
      readonly kind: 'page_view'
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
  readonly properties: Readonly<Record<string, ScalarValue>>
  readonly utmSource: string | null
  readonly utmMedium: string | null
  readonly utmCampaign: string | null
  readonly deviceType: string | null
  readonly browser: string | null
  readonly os: string | null
  readonly country: string | null
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
  readonly replaySequence: number
}

export interface AcceptedEventRecord {
  readonly receiptTime: string
  readonly payloadFingerprint: string
}

export interface AcceptanceRepository {
  findByEventId(siteId: string, eventId: string): Promise<AcceptedEventRecord | undefined>
  lastReplaySequence(): Promise<number>
  append(candidates: readonly AcceptanceCandidate[]): Promise<void>
  deleteExpired(input: { readonly siteId: string; readonly receiptCutoff: Date }): Promise<number>
  walBytes?(): number
}
