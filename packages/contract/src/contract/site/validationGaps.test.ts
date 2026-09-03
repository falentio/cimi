import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SSiteUpdateV2Input } from './command/update-v2.ts'

const validInput = {
  siteId: 'ste-1',
  name: 'Example',
  hostname: 'example.test',
  reportingTimezone: 'UTC',
  weekStartsOn: 'monday',
} as const

describe('site update v2 timezone validation gaps', () => {
  it('rejects an unknown reporting timezone', () => {
    expect(() =>
      v.parse(SSiteUpdateV2Input, { ...validInput, reportingTimezone: 'Mars/Olympus_Mons' }),
    ).toThrow(v.ValiError)
  })

  it('rejects an unknown week start', () => {
    expect(() => v.parse(SSiteUpdateV2Input, { ...validInput, weekStartsOn: 'funday' })).toThrow(
      v.ValiError,
    )
  })
})
