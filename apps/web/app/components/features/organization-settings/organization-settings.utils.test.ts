import { describe, expect, it } from 'vitest'
import type { WorkspaceSite, WorkspaceTeam } from '@/components/features/app-shell/workspace'
import {
  normalizeOrganizationNameDraft,
  normalizeSettingsError,
  resolveActiveOrganizationId,
} from './organization-settings.utils'

const teams = [
  { id: 'org-first', name: 'First', isPersonal: false },
  { id: 'org-second', name: 'Second', isPersonal: false },
] satisfies readonly WorkspaceTeam[]
const sites = [
  { id: 'site-second', teamId: 'org-second', name: 'Second site', hostname: 'second.example' },
] satisfies readonly WorkspaceSite[]

describe('organization settings utilities', () => {
  it('prefers a site route over organization selection', () => {
    expect(
      resolveActiveOrganizationId({
        routeSiteId: 'site-second',
        routeOrganizationId: 'org-first',
        selectedOrganizationId: 'org-first',
        teams,
        sites,
      }),
    ).toBe('org-second')
  })

  it('uses the organization route parameter for an organization without sites', () => {
    expect(
      resolveActiveOrganizationId({
        routeSiteId: undefined,
        routeOrganizationId: 'org-first',
        selectedOrganizationId: undefined,
        teams,
        sites,
      }),
    ).toBe('org-first')
  })

  it('keeps an unknown organization route separate from workspace fallbacks', () => {
    expect(
      resolveActiveOrganizationId({
        routeSiteId: undefined,
        routeOrganizationId: 'missing',
        selectedOrganizationId: 'org-first',
        teams,
        sites,
      }),
    ).toBe('missing')
  })

  it('falls back safely when the selected organization is stale', () => {
    expect(
      resolveActiveOrganizationId({
        routeSiteId: undefined,
        routeOrganizationId: undefined,
        selectedOrganizationId: 'missing',
        teams,
        sites,
      }),
    ).toBe('org-second')
  })

  it('trims names and rejects blank drafts', () => {
    expect(normalizeOrganizationNameDraft('  Northstar  ')).toBe('Northstar')
    expect(normalizeOrganizationNameDraft('   ')).toBeNull()
  })

  it('uses a caller-provided fallback for unrecognized errors', () => {
    expect(normalizeSettingsError('unexpected', 'Workspace data could not be loaded')).toEqual({
      message: 'Workspace data could not be loaded',
    })
  })
})
