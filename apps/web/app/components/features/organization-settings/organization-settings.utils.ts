import type { WorkspaceSite, WorkspaceTeam } from '@/components/features/app-shell/workspace'
import { normalizeSettingsError as normalizeSharedSettingsError } from '../../../utils/settings-error'
import type { SettingsError } from './organization-settings.types'

export function normalizeSettingsError(
  value: unknown,
  fallbackMessage = 'Organization settings request failed',
): SettingsError {
  return normalizeSharedSettingsError(value, fallbackMessage)
}

export function resolveActiveOrganizationId(input: {
  readonly routeSiteId: string | undefined
  readonly routeOrganizationId: string | undefined
  readonly selectedOrganizationId: string | undefined
  readonly teams: readonly WorkspaceTeam[]
  readonly sites: readonly WorkspaceSite[]
}): string | undefined {
  const routeSite = input.sites.find((site) => site.id === input.routeSiteId)
  if (routeSite !== undefined) return routeSite.teamId

  if (input.routeOrganizationId !== undefined) return input.routeOrganizationId
  if (isKnownOrganization(input.selectedOrganizationId, input.teams)) {
    return input.selectedOrganizationId
  }

  return input.sites[0]?.teamId ?? input.teams[0]?.id
}

export function normalizeOrganizationNameDraft(value: string): string | null {
  const name = value.trim()
  return name.length === 0 ? null : name
}

export function formatSettingsDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

function isKnownOrganization(
  organizationId: string | undefined,
  teams: readonly WorkspaceTeam[],
): organizationId is string {
  return organizationId !== undefined && teams.some((team) => team.id === organizationId)
}
