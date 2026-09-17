import {
  eventBelongsToSession,
  eventsForSession,
  eligibleSessions,
  type ReportEvaluationInput,
} from '../reporting/evaluation.ts'
import {
  eventInPeriod,
  matchesAction,
  sessionInPeriod,
  type ActionMatcher,
  type IdentityScope,
  type ReportEvent,
} from '../reporting/model.ts'
import type { ResolvedPeriod } from '@cimi/kernel'

export interface CohortDefinition {
  readonly entryAction: ActionMatcher
  readonly retentionAction: ActionMatcher
}

export interface CohortDefinitionByPeriod {
  readonly definition: CohortDefinition
  readonly definitionForPeriod?: (period: ResolvedPeriod) => CohortDefinition
}

export interface CohortReportPeriod {
  readonly index: number
  readonly fromDate: string
  readonly toDate: string
  readonly size: number
  readonly retained: number
  readonly rate: number
}

interface CohortEntry {
  readonly key: string
  readonly event: ReportEvent
  readonly enteredAt: number
}

export function evaluateRetention(
  input: ReportEvaluationInput & CohortDefinitionByPeriod,
): readonly CohortReportPeriod[] {
  const identityForPeriod = input.identityForPeriod ?? (() => input.identity)
  const periods = input.period.sequence ?? [input.period.period]
  const orderedEntries = periods
    .flatMap((period) => {
      const periodIdentity = identityForPeriod(period)
      const membershipSessions = eligibleSessions({
        snapshot: input.snapshot,
        period: input.period.period,
        identity: periodIdentity,
        filters: input.filters,
      })
      const membershipSessionIds = new Set(membershipSessions.map((session) => session.sessionId))
      const membershipSessionsById = new Map(
        membershipSessions.map((session) => [session.sessionId, session]),
      )
      const entryAction = (input.definitionForPeriod?.(period) ?? input.definition).entryAction

      return input.snapshot.events
        .filter((event) => eventInPeriod(event, input.period.period))
        .filter((event) => eventInPeriod(event, period))
        .filter((event) => event.sessionId !== null && membershipSessionIds.has(event.sessionId))
        .filter((event) => periodIdentity.subjectOfEvent(event) !== null)
        .filter((event) => matchesAction(event, entryAction))
        .filter((event) => {
          const session =
            event.sessionId === null ? undefined : membershipSessionsById.get(event.sessionId)
          return session !== undefined && eventBelongsToSession(event, session, periodIdentity)
        })
        .flatMap((event) => {
          const subject = periodIdentity.subjectOfEvent(event)
          return subject === null
            ? []
            : [
                {
                  key: identityKey(periodIdentity.kind, subject),
                  event,
                  enteredAt: event.occurrenceTime.getTime(),
                },
              ]
        })
    })
    .toSorted((left, right) => compareEvents(left.event, right.event))
  const entries = new Map<string, CohortEntry>()
  for (const entry of orderedEntries) {
    if (!entries.has(entry.key)) {
      entries.set(entry.key, entry)
    }
  }

  return periods.map((period, index) => {
    const periodIdentity = identityForPeriod(period)
    const retentionSessions = input.snapshot.sessions.filter((session) => {
      if (session.endedAt === null || !periodIdentity.sessionIsEligible(session)) return false
      if (!sessionInPeriod(session, period)) return false
      return true
    })
    const retained = new Set<string>()
    for (const entry of entries.values()) {
      const matched = retentionSessions.some((session) =>
        eventsForSession(input.snapshot.events, session).some(
          (event) =>
            eventInPeriod(event, period) &&
            event.occurrenceTime.getTime() >= entry.enteredAt &&
            sameIdentity(entry.event, event, periodIdentity.kind) &&
            eventBelongsToSession(event, session, periodIdentity) &&
            matchesAction(
              event,
              (input.definitionForPeriod?.(period) ?? input.definition).retentionAction,
            ),
        ),
      )
      if (matched) retained.add(entry.key)
    }
    return {
      index,
      fromDate: String(period.dates.fromDate),
      toDate: String(period.dates.toDate),
      size: entries.size,
      retained: retained.size,
      rate: ratio(retained.size, entries.size),
    }
  })
}

function identityKey(kind: IdentityScope['kind'], subject: string): string {
  return `${kind}:${subject}`
}

function sameIdentity(
  entry: ReportEvent,
  event: ReportEvent,
  kind: IdentityScope['kind'],
): boolean {
  return kind === 'visitor'
    ? entry.visitorId === event.visitorId
    : entry.identifiedUserId !== null && entry.identifiedUserId === event.identifiedUserId
}

function compareEvents(
  left: Parameters<typeof eventInPeriod>[0],
  right: Parameters<typeof eventInPeriod>[0],
): number {
  const time = left.occurrenceTime.getTime() - right.occurrenceTime.getTime()
  return time === 0 ? left.eventId.localeCompare(right.eventId) : time
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}
