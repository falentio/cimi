import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { contract, SSystemHealthOutput } from '../index.ts'

describe('system health contract', () => {
  it('exposes contract.system.health', () => {
    expect(contract.system.health).toBeDefined()
  })

  it('accepts a valid health output', () => {
    expect(
      v.parse(SSystemHealthOutput, {
        status: 'ok',
        controlDatabase: true,
        analyticsDatabase: false,
      }),
    ).toEqual({
      status: 'ok',
      controlDatabase: true,
      analyticsDatabase: false,
    })
  })

  it('rejects a missing field', () => {
    expect(() =>
      v.parse(SSystemHealthOutput, {
        status: 'ok',
        controlDatabase: true,
      }),
    ).toThrow(v.ValiError)
  })

  it('rejects an invalid status', () => {
    expect(() =>
      v.parse(SSystemHealthOutput, {
        status: 'nope',
        controlDatabase: true,
        analyticsDatabase: false,
      }),
    ).toThrow(v.ValiError)
  })
})
