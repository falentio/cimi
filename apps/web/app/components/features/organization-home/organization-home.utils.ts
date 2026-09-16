import type { WorkspaceSite, WorkspaceTeam } from '@/components/features/app-shell/workspace'
import type {
  OrganizationId,
  SettingsError,
} from '@/components/features/organization-settings/organization-settings.types'
import type { OrganizationHomeState } from './organization-home.types'

export interface DeriveOrganizationHomeStateInput {
  readonly organizationId: OrganizationId | undefined
  readonly teams: readonly WorkspaceTeam[]
  readonly sites: readonly WorkspaceSite[]
  readonly isLoading: boolean
  readonly error: SettingsError | undefined
}

export function parseOrganizationId(value: unknown): OrganizationId | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

export function deriveOrganizationHomeState(
  input: DeriveOrganizationHomeStateInput,
): OrganizationHomeState {
  if (input.organizationId === undefined) return { kind: 'invalid-route' }
  if (input.isLoading) return { kind: 'loading' }
  if (input.error !== undefined) return { kind: 'error', error: input.error }

  const organization = input.teams.find((team) => team.id === input.organizationId)
  if (organization === undefined) {
    return { kind: 'missing', organizationId: input.organizationId }
  }

  return {
    kind: 'ready',
    organization,
    sites: input.sites.filter((site) => site.teamId === input.organizationId),
  }
}
