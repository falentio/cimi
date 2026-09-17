export interface WorkspaceTeam {
  readonly id: string
  readonly name: string
  readonly isPersonal: boolean
}

export interface WorkspaceSite {
  readonly id: string
  readonly teamId: string
  readonly name: string
  readonly hostname: string
}

export function getTeamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length > 1)
    return parts
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  return name.trim().slice(0, 2).toUpperCase()
}

export function getTeamKindLabel(team: WorkspaceTeam): string {
  return team.isPersonal ? 'Personal organization' : 'Organization'
}
