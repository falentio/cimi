import { SId as ContractId, SName as ContractName } from './index.ts'
import {
  SHostname as UtilityHostname,
  SIanaTimezone as UtilityIanaTimezone,
  SId as UtilityId,
  SName as UtilityName,
  SWeekStart as UtilityWeekStart,
} from '@cimi/utils'
import {
  SHostname as ContractHostname,
  SIanaTimezone as ContractIanaTimezone,
  SWeekStart as ContractWeekStart,
} from './index.ts'
import { describe, expect, it } from 'vitest'

describe('contract shared primitives', () => {
  it('uses the authoritative utility schemas without duplicate definitions', () => {
    expect(ContractId).toBe(UtilityId)
    expect(ContractName).toBe(UtilityName)
    expect(ContractHostname).toBe(UtilityHostname)
    expect(ContractIanaTimezone).toBe(UtilityIanaTimezone)
    expect(ContractWeekStart).toBe(UtilityWeekStart)
  })
})
