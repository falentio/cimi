import { describe, expect, it } from 'vitest'
import { resolveOverviewChange } from './site-overview-chart-change'

describe('resolveOverviewChange', () => {
  it('reports a rise as positive for higher-is-better metrics', () => {
    expect(resolveOverviewChange(58.3, 50.3, 'higher-is-better')).toEqual({
      label: '+15.9%',
      kind: 'positive',
    })
  })

  it('reports a drop as negative for higher-is-better metrics', () => {
    expect(resolveOverviewChange(40, 50, 'higher-is-better')).toEqual({
      label: '-20.0%',
      kind: 'negative',
    })
  })

  it('inverts sentiment for lower-is-better metrics', () => {
    expect(resolveOverviewChange(31.2, 32.1, 'lower-is-better')).toEqual({
      label: '-2.8%',
      kind: 'positive',
    })
    expect(resolveOverviewChange(34.5, 32, 'lower-is-better')).toEqual({
      label: '+7.8%',
      kind: 'negative',
    })
  })

  it('treats an unchanged value as neutral', () => {
    expect(resolveOverviewChange(50, 50, 'higher-is-better')).toEqual({
      label: '0.0%',
      kind: 'neutral',
    })
  })

  it('returns null when a value is missing or the base is zero', () => {
    expect(resolveOverviewChange(undefined, 50, 'higher-is-better')).toBeNull()
    expect(resolveOverviewChange(50, undefined, 'higher-is-better')).toBeNull()
    expect(resolveOverviewChange(10, 0, 'higher-is-better')).toBeNull()
  })
})
