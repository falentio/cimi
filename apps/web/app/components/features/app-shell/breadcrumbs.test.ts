import { describe, expect, it } from 'vitest'
import { resolveBreadcrumbs } from './breadcrumbs'

describe('resolveBreadcrumbs', () => {
  it('names the Sites home', () => {
    expect(resolveBreadcrumbs('/')).toEqual([{ label: 'Sites' }])
  })

  it('trails Sites into a Site page', () => {
    expect(resolveBreadcrumbs('/sites/ste_1')).toEqual([
      { label: 'Sites', to: '/' },
      { label: 'ste_1', to: '/sites/ste_1' },
    ])
  })

  it('appends the Site tab to the trail', () => {
    expect(resolveBreadcrumbs('/sites/ste_1/events')).toEqual([
      { label: 'Sites', to: '/' },
      { label: 'ste_1', to: '/sites/ste_1' },
      { label: 'Events' },
    ])
  })

  it('interpolates the Site settings trail', () => {
    expect(resolveBreadcrumbs('/sites/ste_1/settings/general')).toEqual([
      { label: 'Sites', to: '/' },
      { label: 'ste_1', to: '/sites/ste_1' },
      { label: 'Settings', to: '/sites/ste_1/settings' },
      { label: 'General' },
    ])
  })

  it('trails Settings and Admin sections', () => {
    expect(resolveBreadcrumbs('/settings/members')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Members' },
    ])
    expect(resolveBreadcrumbs('/admin/backup-restore')).toEqual([
      { label: 'Admin', to: '/admin' },
      { label: 'Backup Restore' },
    ])
  })

  it('returns nothing for bare and public routes', () => {
    expect(resolveBreadcrumbs('/setup')).toEqual([])
    expect(resolveBreadcrumbs('/public/abc123')).toEqual([])
  })
})
