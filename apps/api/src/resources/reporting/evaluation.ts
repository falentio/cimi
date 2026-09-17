import type { ResolvedPeriod } from '@cimi/kernel'
import {
  eventInPeriod,
  matchesReportFilters,
  sessionInPeriod,
  type EvaluationPeriod,
  type IdentityScope,
  type ReportEvent,
  type ReportFilter,
  type ReportSession,
  type ReportSnapshot,
} from './model.ts'

export interface ReportEvaluationInput {
  readonly period: EvaluationPeriod
  readonly snapshot: ReportSnapshot
  readonly identity: IdentityScope
  readonly filters: readonly ReportFilter[] | undefined
}

export function eligibleSessions(input: {
  readonly snapshot: ReportSnapshot
  readonly period: ResolvedPeriod
  readonly identity: IdentityScope
  readonly filters: readonly ReportFilter[] | undefined
}): readonly ReportSession[] {
  return input.snapshot.sessions.filter((session) => {
    if (session.endedAt === null || !sessionInPeriod(session, input.period)) return false
    if (!input.identity.sessionIsEligible(session)) return false
    return matchesReportFilters({
      session,
      events: eventsForSession(input.snapshot.events, session),
      filters: input.filters,
      period: input.period,
      profileTraits: new Map(
        [...input.snapshot.activeProfiles].map(([id, profile]) => [id, profile.traits]),
      ),
    })
  })
}

export function eventsForSession(
  events: readonly ReportEvent[],
  session: ReportSession,
): readonly ReportEvent[] {
  return events.filter((event) => event.sessionId === session.sessionId)
}

export function eventBelongsToSession(
  event: ReportEvent,
  session: ReportSession,
  identity: IdentityScope,
): boolean {
  const subject = identity.subjectOfSession(session)
  return (
    subject !== null &&
    identity.subjectOfEvent(event) === subject &&
    event.sessionId === session.sessionId
  )
}

export function eventsForPeriod(input: {
  readonly snapshot: ReportSnapshot
  readonly period: ResolvedPeriod
  readonly identity: IdentityScope
  readonly sessionIds?: ReadonlySet<string>
}): readonly ReportEvent[] {
  return input.snapshot.events.filter((event) => {
    if (!eventInPeriod(event, input.period)) return false
    if (input.identity.subjectOfEvent(event) === null) return false
    if (input.sessionIds !== undefined && event.sessionId !== null) {
      return input.sessionIds.has(event.sessionId)
    }
    return false
  })
}
