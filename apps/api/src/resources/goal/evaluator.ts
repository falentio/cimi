import {
  eventBelongsToSession,
  eventsForSession,
  eligibleSessions,
  type ReportEvaluationInput,
} from '../reporting/evaluation.ts'
import { eventInPeriod, matchesAction, type ActionMatcher } from '../reporting/model.ts'

export interface GoalDefinition {
  readonly action: ActionMatcher
  readonly propertyFilters: Parameters<typeof matchesAction>[2]
}

export interface GoalReportCounts {
  readonly conversions: number
  readonly eligibleSessions: number
}

export function evaluateGoal(
  input: ReportEvaluationInput & { readonly definition: GoalDefinition },
): GoalReportCounts {
  const sessions = eligibleSessions({
    snapshot: input.snapshot,
    period: input.period.period,
    identity: input.identity,
    filters: input.filters,
  })
  const conversions = sessions.filter((session) =>
    eventsForSession(input.snapshot.events, session).some(
      (event) =>
        eventInPeriod(event, input.period.period) &&
        eventBelongsToSession(event, session, input.identity) &&
        matchesAction(event, input.definition.action, input.definition.propertyFilters),
    ),
  ).length
  return { conversions, eligibleSessions: sessions.length }
}
