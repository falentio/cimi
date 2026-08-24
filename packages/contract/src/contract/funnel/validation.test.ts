import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SFunnelAction, SFunnelReportSteps } from './schema.ts'

describe('funnel report contract', () => {
  it('rejects names on pageview actions and requires names for named Event kinds', () => {
    expect(v.safeParse(SFunnelAction, { kind: 'page_view', name: '/home' }).success).toBe(false)
    expect(v.safeParse(SFunnelAction, { kind: 'custom_event' }).success).toBe(false)
    expect(v.safeParse(SFunnelAction, { kind: 'custom_event', name: 'checkout' }).success).toBe(
      true,
    )
  })

  it('requires ordered contiguous report steps', () => {
    const step = (index: number) => ({
      index,
      matched: 1,
      rateFromEntry: 0.5,
      rateFromPrevious: 0.5,
    })
    expect(v.safeParse(SFunnelReportSteps, [step(0), step(1)]).success).toBe(true)
    expect(v.safeParse(SFunnelReportSteps, [step(1), step(2)]).success).toBe(false)
    expect(v.safeParse(SFunnelReportSteps, [step(0)]).success).toBe(false)
  })
})
