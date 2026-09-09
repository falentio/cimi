import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { DerivedAttribution } from './attribution.ts'
import type { IdentitySessionAssignment, IdentitySessionResolver } from './service.ts'
import type { EventInput, NormalizedEvent } from './repository.ts'

const SESSION_INACTIVITY_MS = 30 * 60 * 1000
const SESSION_MAX_MS = 24 * 60 * 60 * 1000

interface SessionState {
  visitorId: string
  sessionId: string
  lastSeenMs: number
  sessionStartMs: number
  attribution: DerivedAttribution
}

export interface DefaultIdentitySessionResolverDependencies {
  readonly clock?: (() => Date) | undefined
  readonly references?:
    | { exists(siteId: string, identifiedUserId: string): Promise<boolean> }
    | undefined
}

function sessionKey(siteId: string, identifiedUserId: string): string {
  return `${siteId}\u0000${identifiedUserId}`
}

function draftAttribution(event: NormalizedEvent): DerivedAttribution {
  return {
    utmSource: event.utmSource,
    utmMedium: event.utmMedium,
    utmCampaign: event.utmCampaign,
    deviceType: event.deviceType,
    browser: event.browser,
    os: event.os,
    country: event.country,
  }
}

export class DefaultIdentitySessionResolver implements IdentitySessionResolver {
  private readonly clock: () => Date
  private readonly references: DefaultIdentitySessionResolverDependencies['references']
  private readonly sessions = new Map<string, SessionState>()

  constructor({ clock, references }: DefaultIdentitySessionResolverDependencies = {}) {
    this.clock = clock ?? (() => new Date())
    this.references = references
  }

  async resolve(input: {
    readonly siteId: string
    readonly event: NormalizedEvent
    readonly receiptTime: Date
    readonly collectionContext: EventInput['collectionContext']
    readonly identifiedUserId: string | null
  }): Promise<IdentitySessionAssignment> {
    const nowMs = this.clock().getTime()
    const receiptMs = Number.isFinite(input.receiptTime.getTime())
      ? input.receiptTime.getTime()
      : nowMs
    const identifiedUserId = input.identifiedUserId
    if (identifiedUserId === null) {
      return { visitorId: null, identifiedUserId: null, analyticsSessionId: null }
    }
    if (
      this.references !== undefined &&
      !(await this.references.exists(input.siteId, identifiedUserId))
    ) {
      throw new ORPCError('BAD_REQUEST')
    }
    const key = sessionKey(input.siteId, identifiedUserId)
    const existing = this.sessions.get(key)
    if (existing !== undefined) {
      const inactive = receiptMs - existing.lastSeenMs > SESSION_INACTIVITY_MS
      const expired = receiptMs - existing.sessionStartMs > SESSION_MAX_MS
      if (!inactive && !expired) {
        existing.lastSeenMs = receiptMs
        return {
          visitorId: existing.visitorId,
          identifiedUserId,
          analyticsSessionId: existing.sessionId,
          attribution: existing.attribution,
        }
      }
      const next: SessionState = {
        visitorId: existing.visitorId,
        sessionId: generateId('ses'),
        lastSeenMs: receiptMs,
        sessionStartMs: receiptMs,
        attribution: draftAttribution(input.event),
      }
      this.sessions.set(key, next)
      return {
        visitorId: next.visitorId,
        identifiedUserId,
        analyticsSessionId: next.sessionId,
        attribution: next.attribution,
      }
    }
    const state: SessionState = {
      visitorId: generateId('vis'),
      sessionId: generateId('ses'),
      lastSeenMs: receiptMs,
      sessionStartMs: receiptMs,
      attribution: draftAttribution(input.event),
    }
    this.sessions.set(key, state)
    return {
      visitorId: state.visitorId,
      identifiedUserId,
      analyticsSessionId: state.sessionId,
      attribution: state.attribution,
    }
  }
}
