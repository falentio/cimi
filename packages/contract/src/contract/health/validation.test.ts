import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { contract, SSystemHealthOutput } from '../../index.ts'
import { SQueryFilter } from '../../schema/index.ts'

describe('system health contract', () => {
  it('exposes contract.health.health', () => {
    expect(contract.health.health).toBeDefined()
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

  it('exposes the first-release contract domains', () => {
    expect(contract.site.createSite).toBeDefined()
    expect(contract.eventIngestion.collectEvent).toBeDefined()
    expect(contract.funnel.getFunnelReport).toBeDefined()
    expect(contract.backupRestore.restoreBackup).toBeDefined()
  })

  it('rejects unknown query filter keys', () => {
    expect(() =>
      v.parse(SQueryFilter, {
        field: 'country',
        operator: 'equals',
        values: ['GB'],
        unsafeSql: '1=1',
      }),
    ).toThrow(v.ValiError)
  })
})
