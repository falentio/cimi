import { queryLimitExceeded } from './errors.ts'
import type {
  CoverageDependency,
  ResolvedPeriods,
  RetentionBoundary,
  RetentionCoverage,
} from './types.ts'

export function checkRetentionCoverage(input: {
  readonly coverage: RetentionCoverage
  readonly required: readonly CoverageDependency[]
  readonly periods: ResolvedPeriods
}): void {
  for (const dependency of input.required) {
    const boundary = boundaryForDependency(input.coverage, dependency)
    if (!coversPeriod(boundary, input.periods.current.interval.start)) {
      throw queryLimitExceeded('retention-incomplete')
    }
    if (
      input.periods.comparison !== null &&
      !coversPeriod(boundary, input.periods.comparison.interval.start)
    ) {
      throw queryLimitExceeded('retention-incomplete')
    }
  }
}

function boundaryForDependency(
  coverage: RetentionCoverage,
  dependency: CoverageDependency,
): RetentionBoundary {
  switch (dependency) {
    case 'event-occurrence':
      return coverage.eventOccurrence
    case 'profile-activity':
      return coverage.profileActivity
    case 'replay-receipt':
      return coverage.replayReceipt
  }
}

function coversPeriod(boundary: RetentionBoundary, periodStart: number): boolean {
  return boundary.state === 'available' && boundary.from <= periodStart
}
