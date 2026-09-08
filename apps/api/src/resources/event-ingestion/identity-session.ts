import { generateId } from '@cimi/utils'
import type { IdentitySessionAssignment, IdentitySessionResolver } from './service.ts'
import type { EventInput, NormalizedEvent } from './repository.ts'

const SESSION_INACTIVITY_MS = 30 * 60 * 1000
const SESSION_MAX_MS = 24 * 60 * 60 * 1000

interface SessionState {
  visitorId: string
  sessionId: string
  lastSeenMs: number
  sessionStartMs: number
}

export interface DefaultIdentitySessionResolverDependencies {
  readonly clock?: (() => Date) | undefined
}

function sessionKey(siteId: string, identifiedUserId: string): string {
  return `${siteId} ${identifiedUserId}`
}

export class DefaultIdentitySessionResolver implements IdentitySessionResolver {
  private readonly clock: () => Date
  private readonly sessions = new Map<string, SessionState>()

  constructor({ clock }: DefaultIdentitySessionResolverDependencies = {}) {
    this.clock = clock ?? (() => new Date())
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
      return {
        visitorId: generateId('vis'),
        identifiedUserId: null,
        analyticsSessionId: generateId('ses'),
      }
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
        }
      }
      const sessionId = generateId('ses')
      const next: SessionState = {
        visitorId: existing.visitorId,
        sessionId,
        lastSeenMs: receiptMs,
        sessionStartMs: receiptMs,
      }
      this.sessions.set(key, next)
      return {
        visitorId: next.visitorId,
        identifiedUserId,
        analyticsSessionId: next.sessionId,
      }
    }
    const state: SessionState = {
      visitorId: generateId('vis'),
      sessionId: generateId('ses'),
      lastSeenMs: receiptMs,
      sessionStartMs: receiptMs,
    }
    this.sessions.set(key, state)
    return {
      visitorId: state.visitorId,
      identifiedUserId,
      analyticsSessionId: state.sessionId,
    }
  }
}
