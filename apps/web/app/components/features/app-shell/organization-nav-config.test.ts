import { describe, expect, it } from 'vitest'
import { isNavItemActive } from './nav-config'
import {
  createOrganizationNav,
  organizationHomePath,
  organizationSettingsPath,
  siteOverviewPath,
  siteSettingsPath,
} from './organization-nav-config'

describe('organization navigation', () => {
  it('builds typed organization destinations', () => {
    expect(organizationHomePath('org_1')).toBe('/org/org_1/home')
    expect(organizationSettingsPath('org_1')).toBe('/org/org_1/settings')
    expect(siteOverviewPath('site_1')).toBe('/sites/site_1')
    expect(siteSettingsPath('site_1')).toBe('/sites/site_1/settings')
  })

  it('creates Home and Settings entries with precise active matching', () => {
    const navigation = createOrganizationNav({ organizationId: 'org_1', label: 'North Star' })

    expect(navigation).toMatchObject({
      label: 'North Star',
      items: [
        { title: 'Home', to: '/org/org_1/home', exact: true },
        { title: 'Settings', to: '/org/org_1/settings' },
      ],
    })
    const home = navigation.items.find((item) => item.title === 'Home')
    const settings = navigation.items.find((item) => item.title === 'Settings')
    if (home === undefined || settings === undefined)
      throw new Error('organization nav is incomplete')
    expect(isNavItemActive('/org/org_1/home', home)).toBe(true)
    expect(isNavItemActive('/org/org_1/home/child', home)).toBe(false)
    expect(isNavItemActive('/org/org_1/settings/members', settings)).toBe(true)
  })
})
