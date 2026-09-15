import type { WorkspaceSite, WorkspaceTeam } from '@/components/features/app-shell/workspace'
import type { SettingsError } from './organization-settings.types'

export function resolveActiveOrganizationId(input: {
  readonly routeSiteId: string | undefined
  readonly urlOrganizationId: string | undefined
  readonly selectedOrganizationId: string | undefined
  readonly teams: readonly WorkspaceTeam[]
  readonly sites: readonly WorkspaceSite[]
}): string | undefined {
  const routeSite = input.sites.find((site) => site.id === input.routeSiteId)
  if (routeSite !== undefined) return routeSite.teamId

  if (isKnownOrganization(input.urlOrganizationId, input.teams)) return input.urlOrganizationId
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

export function normalizeSettingsError(value: unknown): SettingsError {
  if (value instanceof Error) {
    return { message: value.message || 'Organization settings request failed' }
  }

  if (isRecord(value)) {
    const message = typeof value.message === 'string' ? value.message : undefined
    const code = typeof value.code === 'string' ? value.code : undefined
    if (message !== undefined) return code === undefined ? { message } : { code, message }
  }

  return { message: 'Organization settings request failed' }
}

function isKnownOrganization(
  organizationId: string | undefined,
  teams: readonly WorkspaceTeam[],
): organizationId is string {
  return organizationId !== undefined && teams.some((team) => team.id === organizationId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
