import { describe, expect, it } from 'vitest'
import type { WorkspaceSite, WorkspaceTeam } from '@/components/features/app-shell/workspace'
import { deriveOrganizationHomeState, parseOrganizationId } from './organization-home.utils'

const teams: readonly WorkspaceTeam[] = [
  { id: 'org_1', name: 'North Star', isPersonal: false },
  { id: 'org_2', name: 'Personal', isPersonal: true },
]

const sites: readonly [WorkspaceSite, WorkspaceSite, WorkspaceSite] = [
  { id: 'site_1', teamId: 'org_1', name: 'North Star', hostname: 'north.example' },
  { id: 'site_2', teamId: 'org_2', name: 'Personal', hostname: 'personal.example' },
  { id: 'site_3', teamId: 'org_1', name: 'Docs', hostname: 'docs.example' },
]

describe('deriveOrganizationHomeState', () => {
  it('returns invalid-route for a missing or malformed route parameter', () => {
    expect(parseOrganizationId(undefined)).toBeUndefined()
    expect(parseOrganizationId(['org_1'])).toBeUndefined()
    expect(parseOrganizationId('')).toBeUndefined()
    expect(parseOrganizationId('   ')).toBeUndefined()
    expect(
      deriveOrganizationHomeState({
        organizationId: undefined,
        teams,
        sites,
        isLoading: false,
        error: undefined,
      }),
    ).toEqual({ kind: 'invalid-route' })
  })

  it('applies invalid, loading, error, missing, and ready precedence', () => {
    expect(
      deriveOrganizationHomeState({
        organizationId: undefined,
        teams,
        sites,
        isLoading: true,
        error: { message: 'failed' },
      }),
    ).toEqual({ kind: 'invalid-route' })
    expect(
      deriveOrganizationHomeState({
        organizationId: 'org_1',
        teams,
        sites,
        isLoading: true,
        error: { message: 'failed' },
      }),
    ).toEqual({ kind: 'loading' })
    expect(
      deriveOrganizationHomeState({
        organizationId: 'org_1',
        teams,
        sites,
        isLoading: false,
        error: { message: 'failed' },
      }),
    ).toEqual({ kind: 'error', error: { message: 'failed' } })
    expect(
      deriveOrganizationHomeState({
        organizationId: 'org_missing',
        teams,
        sites,
        isLoading: false,
        error: undefined,
      }),
    ).toEqual({ kind: 'missing', organizationId: 'org_missing' })
    expect(
      deriveOrganizationHomeState({
        organizationId: 'org_1',
        teams,
        sites,
        isLoading: false,
        error: undefined,
      }),
    ).toMatchObject({ kind: 'ready', organization: teams[0] })
  })

  it('filters sites by the route organization and keeps empty organizations ready', () => {
    expect(
      deriveOrganizationHomeState({
        organizationId: 'org_1',
        teams,
        sites,
        isLoading: false,
        error: undefined,
      }),
    ).toMatchObject({ kind: 'ready', sites: [sites[0], sites[2]] })
    expect(
      deriveOrganizationHomeState({
        organizationId: 'org_2',
        teams,
        sites: [sites[0]],
        isLoading: false,
        error: undefined,
      }),
    ).toMatchObject({ kind: 'ready', organization: teams[1], sites: [] })
  })
})
