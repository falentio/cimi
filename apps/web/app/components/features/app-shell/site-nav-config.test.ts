import { describe, expect, it } from 'vitest'
import { isNavItemActive } from './nav-config'
import { createSiteSectionNav } from './site-nav-config'

describe('site section navigation', () => {
  it('creates section targets for the active site', () => {
    const navigation = createSiteSectionNav({ siteId: 'ste_1', label: 'Example Site' })

    expect(navigation).toMatchObject({
      label: 'Example Site',
      items: [
        { title: 'Overview', to: '/sites/ste_1', exact: true },
        { title: 'Events', to: '/sites/ste_1/events' },
        { title: 'Goals', to: '/sites/ste_1/goals' },
        { title: 'Funnels', to: '/sites/ste_1/funnels' },
        { title: 'Cohorts', to: '/sites/ste_1/cohorts' },
        { title: 'Settings', to: '/sites/ste_1/settings' },
      ],
    })
  })

  it('matches the active section without activating overview for descendants', () => {
    expect(isNavItemActive('/sites/ste_1/events', { to: '/sites/ste_1', exact: true })).toBe(false)
    expect(isNavItemActive('/sites/ste_1/settings/general', { to: '/sites/ste_1/settings' })).toBe(
      true,
    )
  })
})
