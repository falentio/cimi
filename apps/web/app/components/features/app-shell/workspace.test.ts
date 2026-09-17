import { describe, expect, it } from 'vitest'
import { getTeamInitials, getTeamKindLabel } from './workspace'

describe('workspace switcher data', () => {
  it('derives readable organization labels', () => {
    expect(getTeamInitials('North Star')).toBe('NS')
    expect(getTeamInitials(' cimi ')).toBe('CI')
    expect(getTeamKindLabel({ id: 'cimi', name: 'Cimi', isPersonal: true })).toBe(
      'Personal organization',
    )
    expect(getTeamKindLabel({ id: 'northstar', name: 'Northstar', isPersonal: false })).toBe(
      'Organization',
    )
  })
})
