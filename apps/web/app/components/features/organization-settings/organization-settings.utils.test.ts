import { describe, expect, it } from 'vitest'
import type { WorkspaceSite, WorkspaceTeam } from '@/components/features/app-shell/workspace'
import {
  normalizeOrganizationNameDraft,
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
  it('prefers a valid site route over organization selection', () => {
    expect(
      resolveActiveOrganizationId({
        routeSiteId: 'site-second',
        urlOrganizationId: 'org-first',
        selectedOrganizationId: 'org-first',
        teams,
        sites,
      }),
    ).toBe('org-second')
  })

  it('supports a valid organization query for an organization without sites', () => {
    expect(
      resolveActiveOrganizationId({
        routeSiteId: undefined,
        urlOrganizationId: 'org-first',
        selectedOrganizationId: undefined,
        teams,
        sites,
      }),
    ).toBe('org-first')
  })

  it('falls back safely when the selected organization is stale', () => {
    expect(
      resolveActiveOrganizationId({
        routeSiteId: undefined,
        urlOrganizationId: 'missing',
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
})
