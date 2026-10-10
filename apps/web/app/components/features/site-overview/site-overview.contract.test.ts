import { describe, expect, it } from 'vitest'
import { safeParse, type InferInput } from 'valibot'
import { STrafficBreakdownsInput, STrafficOverviewInput } from '@cimi/contract'
import { resolveOverviewRangeRequest } from './site-overview.range'
import { overviewBreakdownSections } from './site-overview-breakdowns'
import type { OverviewBreakdownDimension } from './site-overview.types'

type OverviewRange = Parameters<typeof resolveOverviewRangeRequest>[0]

const SITE_ID = 'ste_keaihw3er55glv7jstcwohm6qm'

const TODAY = '2026-10-10'

type OverviewRequest = InferInput<typeof STrafficOverviewInput>

type BreakdownRequest = InferInput<typeof STrafficBreakdownsInput>

function rangeFields(range: OverviewRange, comparison: boolean) {
  const request = resolveOverviewRangeRequest(range, TODAY, comparison)

  const fields = {
    fromDate: request.fromDate,
    toDate: request.toDate,
    granularity: request.granularity,
  }

  if (request.comparison === undefined) return fields

  return { ...fields, comparison: request.comparison }
}

function overviewInput(range: OverviewRange, comparison: boolean): OverviewRequest {
  return { siteId: SITE_ID, ...rangeFields(range, comparison) }
}

function breakdownInput(
  dimension: OverviewBreakdownDimension,
  range: OverviewRange,
  comparison: boolean,
): BreakdownRequest {
  return { siteId: SITE_ID, dimension, limit: 20, ...rangeFields(range, comparison) }
}

describe('contract compliance of the traffic requests', () => {
  it('parses every range the page offers through the overview input schema', () => {
    for (const range of ['7d', '30d', '90d', '12m'] as const) {
      const result = safeParse(STrafficOverviewInput, overviewInput(range, false))

      expect(result.success, range + ' failed: ' + JSON.stringify(result.issues ?? {})).toBe(true)
    }
  })

  it('parses a comparison window the contract accepts as adjacent and equal length', () => {
    for (const range of ['7d', '30d', '90d', '12m'] as const) {
      const result = safeParse(STrafficOverviewInput, overviewInput(range, true))

      expect(result.success, range + ' failed: ' + JSON.stringify(result.issues ?? {})).toBe(true)
    }
  })

  it('omits the comparison key when comparison is off, so the strict object accepts it', () => {
    expect(Object.hasOwn(overviewInput('7d', false), 'comparison')).toBe(false)
  })

  it('parses every dimension the breakdown registry names through the breakdown input schema', () => {
    const dimensions = overviewBreakdownSections.flatMap((section) =>
      section.tabs.map((tab) => tab.dimension),
    )

    expect(dimensions.length).toBeGreaterThan(0)

    for (const dimension of dimensions) {
      const result = safeParse(STrafficBreakdownsInput, breakdownInput(dimension, '30d', false))

      expect(result.success, dimension + ' failed: ' + JSON.stringify(result.issues ?? {})).toBe(
        true,
      )
    }
  })

  it('sends filters whose shape the contract filter schema accepts', () => {
    const request: OverviewRequest = {
      ...overviewInput('30d', false),
      filters: [
        { scope: 'event', field: 'pagePath', operator: 'equals', values: ['/pricing'] },
        { scope: 'session', field: 'country', operator: 'equals', values: ['US'] },
      ],
    }

    expect(safeParse(STrafficOverviewInput, request).success).toBe(true)
  })

  it('rejects the operators this page no longer offers, so the removal is proven necessary', () => {
    const rejectedOperators = ['greater_than', 'less_than'] as const

    for (const operator of rejectedOperators) {
      const request: OverviewRequest = {
        ...overviewInput('30d', false),
        filters: [{ scope: 'session', field: 'country', operator, values: ['5'] }],
      }

      expect(safeParse(STrafficOverviewInput, request).success).toBe(false)
    }
  })
})
