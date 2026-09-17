import {
  eventBelongsToSession,
  eventsForSession,
  eligibleSessions,
  type ReportEvaluationInput,
} from '../reporting/evaluation.ts'
import { eventInPeriod, matchesAction, type ActionMatcher } from '../reporting/model.ts'

export interface FunnelDefinition {
  readonly steps: readonly ActionMatcher[]
}

export interface FunnelReportStep {
  readonly matched: number
  readonly rateFromEntry: number
  readonly rateFromPrevious: number
}

export function evaluateFunnel(
  input: ReportEvaluationInput & { readonly definition: FunnelDefinition },
): readonly FunnelReportStep[] {
  const sessions = eligibleSessions({
    snapshot: input.snapshot,
    period: input.period.period,
    identity: input.identity,
    filters: input.filters,
  })
  const matched = input.definition.steps.map(() => 0)
  for (const session of sessions) {
    const events = eventsForSession(input.snapshot.events, session)
      .filter((event) => eventInPeriod(event, input.period.period))
      .filter((event) => eventBelongsToSession(event, session, input.identity))
      .toSorted(compareEvents)
    let nextStep = 0
    for (const event of events) {
      const step = input.definition.steps[nextStep]
      if (step === undefined || !matchesAction(event, step)) continue
      matched[nextStep] = (matched[nextStep] ?? 0) + 1
      nextStep += 1
      if (nextStep === input.definition.steps.length) break
    }
  }
  const entryCount = matched[0] ?? 0
  return matched.map((count, index) => ({
    matched: count,
    rateFromEntry: ratio(count, entryCount),
    rateFromPrevious: ratio(count, index === 0 ? sessions.length : (matched[index - 1] ?? 0)),
  }))
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
