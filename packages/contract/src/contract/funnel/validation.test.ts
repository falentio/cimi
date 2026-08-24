import { describe, expect, it } from 'vitest'
import { SFunnelAction, SFunnelReportSteps } from './schema.ts'

describe('funnel report contract', () => {
  it('rejects names on pageview actions and requires names for named Event kinds', () => {
    expect({ kind: 'page_view', name: '/home' }).not.toEqual(expect.schemaMatching(SFunnelAction))
    expect({ kind: 'custom_event' }).not.toEqual(expect.schemaMatching(SFunnelAction))
    expect({ kind: 'custom_event', name: 'checkout' }).toEqual(expect.schemaMatching(SFunnelAction))
  })

  it('requires ordered contiguous report steps', () => {
    const step = (index: number) => ({
      index,
      matched: 1,
      rateFromEntry: 0.5,
      rateFromPrevious: 0.5,
    })
    expect([step(0), step(1)]).toEqual(expect.schemaMatching(SFunnelReportSteps))
    expect([step(1), step(2)]).not.toEqual(expect.schemaMatching(SFunnelReportSteps))
    expect([step(0)]).not.toEqual(expect.schemaMatching(SFunnelReportSteps))
  })
})
