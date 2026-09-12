import { generateId } from '@cimi/utils'
import { linkCoversEvent, type IdentityCoverageLink } from '@cimi/db'
import { ORPCError } from '@orpc/server'
import type { DerivedAttribution } from './attribution.ts'
import type { IdentitySessionAssignment, IdentitySessionResolver } from './service.ts'
import type { EventInput, NormalizedEvent, StoredIdentitySession } from './repository.ts'
import { sessionContinues } from './session-window.ts'

interface SessionState {
  visitorId: string
  sessionId: string
  lastSeenMs: number
  sessionStartMs: number
  identifiedUserId: string | null
  attribution: DerivedAttribution
}

interface PendingState {
  state: SessionState
  reservations: number
  readonly assignments: Map<string, SessionState>
  readonly committed: SessionState[]
}

type IdentityKind = 'anonymous' | 'identified'

export interface DefaultIdentitySessionResolverDependencies {
  readonly clock?: (() => Date) | undefined
  readonly references?:
    | { exists(siteId: string, identifiedUserId: string): Promise<boolean> }
    | undefined
  readonly links?:
    | {
        currentForAnonymous(input: {
          readonly siteId: string
          readonly anonymousIdentityId: string
        }): Promise<(IdentityCoverageLink & { readonly identifiedUserId: string }) | undefined>
      }
    | undefined
  readonly history?:
    | {
        findIdentitySession(input: {
          readonly siteId: string
          readonly anonymousIdentityId: string | null
          readonly identifiedUserId: string | null
        }): Promise<StoredIdentitySession | undefined>
      }
    | undefined
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
  private readonly links: DefaultIdentitySessionResolverDependencies['links']
  private readonly history: DefaultIdentitySessionResolverDependencies['history']
  private readonly sessions = new Map<string, Map<IdentityKind, Map<string, SessionState>>>()
  private readonly pending = new Map<string, Map<IdentityKind, Map<string, PendingState>>>()

  constructor({
    clock,
    references,
    links,
    history,
  }: DefaultIdentitySessionResolverDependencies = {}) {
    this.clock = clock ?? (() => new Date())
    this.references = references
    this.links = links
    this.history = history
  }

  async resolve(input: {
    readonly siteId: string
    readonly event: NormalizedEvent
    readonly receiptTime: Date
    readonly collectionContext: EventInput['collectionContext']
    readonly identifiedUserId: string | null
    readonly anonymousIdentityId: string | null
  }): Promise<IdentitySessionAssignment> {
    const nowMs = this.clock().getTime()
    const receiptMs = Number.isFinite(input.receiptTime.getTime())
      ? input.receiptTime.getTime()
      : nowMs
    const identifiedUserId = input.identifiedUserId
    if (
      identifiedUserId !== null &&
      this.references !== undefined &&
      !(await this.references.exists(input.siteId, identifiedUserId))
    ) {
      throw new ORPCError('BAD_REQUEST')
    }

    const key = identityKey(input)
    if (key === undefined) {
      return { visitorId: null, identifiedUserId: null, analyticsSessionId: null }
    }

    const staged = this.getPending(input.siteId, key.kind, key.id)
    let state = staged?.state ?? this.getSession(input.siteId, key.kind, key.id)
    if (staged !== undefined) staged.reservations += 1
    if (state === undefined && this.history !== undefined) {
      const stored = await this.history.findIdentitySession({
        siteId: input.siteId,
        anonymousIdentityId: input.anonymousIdentityId,
        identifiedUserId,
      })
      if (stored !== undefined) state = fromStored(stored, identifiedUserId)
    }

    const linkedUserId =
      identifiedUserId === null && key.kind === 'anonymous'
        ? await this.resolveLinkedUserId(input, state?.sessionId ?? null, receiptMs)
        : null
    const resolvedUserId = identifiedUserId ?? linkedUserId

    const next =
      state === undefined
        ? createState(input.event, receiptMs, resolvedUserId)
        : nextState(state, input.event, receiptMs, resolvedUserId)
    if (staged !== undefined) {
      staged.state = next
      staged.assignments.set(next.sessionId, next)
    } else {
      this.stagePending(input.siteId, key.kind, key.id, next)
    }
    return assignment(next, resolvedUserId)
  }

  private async resolveLinkedUserId(
    input: {
      readonly siteId: string
      readonly event: NormalizedEvent
      readonly anonymousIdentityId: string | null
    },
    analyticsSessionId: string | null,
    receiptMs: number,
  ): Promise<string | null> {
    if (this.links === undefined || input.anonymousIdentityId === null) return null
    const link = await this.links.currentForAnonymous({
      siteId: input.siteId,
      anonymousIdentityId: input.anonymousIdentityId,
    })
    if (link === undefined) return null
    if (
      !linkCoversEvent(link, {
        siteId: input.siteId,
        anonymousIdentityId: input.anonymousIdentityId,
        analyticsSessionId,
        receiptTimeMs: receiptMs,
      })
    )
      return null
    return link.identifiedUserId
  }

  commit(input: Parameters<NonNullable<IdentitySessionResolver['commit']>>[0]): void {
    const key = identityKey(input.event)
    if (key === undefined) return
    const sitePending = this.pending.get(input.siteId)
    const pending = sitePending?.get(key.kind)?.get(key.id)
    const assigned = pending?.assignments.get(input.assignment.analyticsSessionId ?? '')
    if (
      pending === undefined ||
      assigned === undefined ||
      !matchesAssignment(assigned, input.assignment)
    )
      return
    pending.reservations -= 1
    pending.committed.push(assigned)
    if (pending.reservations > 0) return
    this.finishPending(input.siteId, key.kind, key.id, pending)
  }

  rollback(input: Parameters<NonNullable<IdentitySessionResolver['rollback']>>[0]): void {
    const key = identityKey(input.event)
    if (key === undefined) return
    const sitePending = this.pending.get(input.siteId)
    const pending = sitePending?.get(key.kind)?.get(key.id)
    const assigned = pending?.assignments.get(input.assignment.analyticsSessionId ?? '')
    if (
      pending === undefined ||
      assigned === undefined ||
      !matchesAssignment(assigned, input.assignment)
    )
      return
    pending.reservations -= 1
    if (pending.reservations > 0) return
    this.finishPending(input.siteId, key.kind, key.id, pending)
  }

  private getSession(siteId: string, kind: IdentityKind, id: string): SessionState | undefined {
    return this.sessions.get(siteId)?.get(kind)?.get(id)
  }

  private setSession(siteId: string, kind: IdentityKind, id: string, state: SessionState): void {
    let byKind = this.sessions.get(siteId)
    if (byKind === undefined) {
      byKind = new Map()
      this.sessions.set(siteId, byKind)
    }
    let byId = byKind.get(kind)
    if (byId === undefined) {
      byId = new Map()
      byKind.set(kind, byId)
    }
    byId.set(id, state)
  }

  private getPending(siteId: string, kind: IdentityKind, id: string): PendingState | undefined {
    return this.pending.get(siteId)?.get(kind)?.get(id)
  }

  private stagePending(siteId: string, kind: IdentityKind, id: string, state: SessionState): void {
    let byKind = this.pending.get(siteId)
    if (byKind === undefined) {
      byKind = new Map()
      this.pending.set(siteId, byKind)
    }
    let byId = byKind.get(kind)
    if (byId === undefined) {
      byId = new Map()
      byKind.set(kind, byId)
    }
    byId.set(id, {
      state,
      reservations: 1,
      assignments: new Map([[state.sessionId, state]]),
      committed: [],
    })
  }

  private finishPending(
    siteId: string,
    kind: IdentityKind,
    id: string,
    pending: PendingState,
  ): void {
    const sitePending = this.pending.get(siteId)
    sitePending?.get(kind)?.delete(id)
    if (sitePending?.get(kind)?.size === 0) sitePending.delete(kind)
    if (sitePending?.size === 0) this.pending.delete(siteId)
    const committed = pending.committed.at(-1)
    if (committed !== undefined) this.setSession(siteId, kind, id, committed)
  }
}

function identityKey(input: {
  readonly anonymousIdentityId: string | null
  readonly identifiedUserId: string | null
}): { readonly kind: IdentityKind; readonly id: string } | undefined {
  if (input.anonymousIdentityId !== null)
    return { kind: 'anonymous', id: input.anonymousIdentityId }
  if (input.identifiedUserId !== null) return { kind: 'identified', id: input.identifiedUserId }
  return undefined
}

function createState(
  event: NormalizedEvent,
  receiptMs: number,
  identifiedUserId: string | null,
): SessionState {
  return {
    visitorId: generateId('vis'),
    sessionId: generateId('ses'),
    lastSeenMs: receiptMs,
    sessionStartMs: receiptMs,
    identifiedUserId,
    attribution: draftAttribution(event),
  }
}

function nextState(
  state: SessionState,
  event: NormalizedEvent,
  receiptMs: number,
  identifiedUserId: string | null,
): SessionState {
  if (sessionContinues(state, receiptMs)) {
    return {
      ...state,
      lastSeenMs: receiptMs,
      identifiedUserId: identifiedUserId ?? state.identifiedUserId,
    }
  }
  return {
    ...state,
    sessionId: generateId('ses'),
    lastSeenMs: receiptMs,
    sessionStartMs: receiptMs,
    identifiedUserId,
    attribution: draftAttribution(event),
  }
}

function fromStored(stored: StoredIdentitySession, identifiedUserId: string | null): SessionState {
  return {
    visitorId: stored.visitorId,
    sessionId: stored.analyticsSessionId,
    lastSeenMs: Date.parse(stored.receiptTime),
    sessionStartMs: Date.parse(stored.sessionStartTime),
    identifiedUserId,
    attribution: stored.attribution,
  }
}

function assignment(
  state: SessionState,
  identifiedUserId: string | null,
): IdentitySessionAssignment {
  return {
    visitorId: state.visitorId,
    identifiedUserId,
    analyticsSessionId: state.sessionId,
    attribution: state.attribution,
    sessionStartedAt: new Date(state.sessionStartMs).toISOString(),
  }
}

function matchesAssignment(state: SessionState, assignment: IdentitySessionAssignment): boolean {
  return (
    state.visitorId === assignment.visitorId && state.sessionId === assignment.analyticsSessionId
  )
}
