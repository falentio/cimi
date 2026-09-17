import type { ChangeKind, OverviewMetricPolarity } from './site-overview.types'

export interface OverviewChange {
  /** Signed percentage change from previous to current, e.g. `+18.4%`. */
  readonly label: string
  /** Whether the change is an improvement, given the metric polarity. */
  readonly kind: ChangeKind
}

/**
 * Computes the percentage change between a previous and current value and the
 * direction that change represents. A rate metric (`lower-is-better`) flips the
 * sentiment, so a drop reads as positive.
 */
export function resolveOverviewChange(
  current: number | undefined,
  previous: number | undefined,
  polarity: OverviewMetricPolarity,
): OverviewChange | null {
  if (current === undefined || previous === undefined || previous === 0) return null

  const delta = ((current - previous) / Math.abs(previous)) * 100
  const improved = polarity === 'lower-is-better' ? delta < 0 : delta > 0
  const kind: ChangeKind = delta === 0 ? 'neutral' : improved ? 'positive' : 'negative'
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''

  return {
    label: `${sign}${Math.abs(delta).toFixed(1)}%`,
    kind,
  }
}
