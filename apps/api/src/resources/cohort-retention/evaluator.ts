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

export function evaluateRetention(
  input: ReportEvaluationInput & CohortDefinitionByPeriod,
): readonly CohortReportPeriod[] {
  const membershipSessions = eligibleSessions({
    snapshot: input.snapshot,
    period: input.period.period,
    identity: input.identity,
    filters: input.filters,
  })
  const membershipSessionIds = new Set(membershipSessions.map((session) => session.sessionId))
  const membershipSessionsById = new Map(
    membershipSessions.map((session) => [session.sessionId, session]),
  )
  const orderedEntries = input.snapshot.events
    .filter((event) => eventInPeriod(event, input.period.period))
    .filter((event) => event.sessionId !== null && membershipSessionIds.has(event.sessionId))
    .filter((event) => input.identity.subjectOfEvent(event) !== null)
    .filter((event) =>
      matchesAction(
        event,
        (input.definitionForPeriod?.(input.period.period) ?? input.definition).entryAction,
      ),
    )
    .filter((event) => {
      const session =
        event.sessionId === null ? undefined : membershipSessionsById.get(event.sessionId)
      return session !== undefined && eventBelongsToSession(event, session, input.identity)
    })
    .toSorted(compareEvents)
  const entries = new Map<string, number>()
  for (const event of orderedEntries) {
    const subject = input.identity.subjectOfEvent(event)
    if (subject !== null && !entries.has(subject)) {
      entries.set(subject, event.occurrenceTime.getTime())
    }
  }

  const periods = input.period.sequence ?? [input.period.period]
  return periods.map((period, index) => {
    const retentionSessions = input.snapshot.sessions.filter((session) => {
      if (session.endedAt === null || !input.identity.sessionIsEligible(session)) return false
      if (!sessionInPeriod(session, period)) return false
      return true
    })
    const retained = new Set<string>()
    for (const [subject, enteredAt] of entries) {
      const matched = retentionSessions.some((session) =>
        eventsForSession(input.snapshot.events, session).some(
          (event) =>
            eventInPeriod(event, period) &&
            event.occurrenceTime.getTime() >= enteredAt &&
            input.identity.subjectOfEvent(event) === subject &&
            eventBelongsToSession(event, session, input.identity) &&
            matchesAction(
              event,
              (input.definitionForPeriod?.(period) ?? input.definition).retentionAction,
            ),
        ),
      )
      if (matched) retained.add(subject)
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
