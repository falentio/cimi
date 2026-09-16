import { Home01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
import type { WorkspaceSite } from '@/components/features/app-shell/workspace'
import type { OrganizationId } from '@/components/features/organization-settings/organization-settings.types'
import type { NavGroup } from './nav-config'

export interface CreateOrganizationNavInput {
  readonly organizationId: OrganizationId
  readonly label: string
}

export function organizationHomePath(organizationId: OrganizationId): string {
  return `/org/${organizationId}/home`
}

export function organizationSettingsPath(organizationId: OrganizationId): string {
  return `/org/${organizationId}/settings`
}

export function siteOverviewPath(siteId: WorkspaceSite['id']): string {
  return `/sites/${siteId}`
}

export function siteSettingsPath(siteId: WorkspaceSite['id']): string {
  return `${siteOverviewPath(siteId)}/settings`
}

export function createOrganizationNav(input: CreateOrganizationNavInput): NavGroup {
  return {
    label: input.label,
    items: [
      {
        title: 'Home',
        to: organizationHomePath(input.organizationId),
        icon: Home01Icon,
        exact: true,
      },
      {
        title: 'Settings',
        to: organizationSettingsPath(input.organizationId),
        icon: Settings01Icon,
      },
    ],
  }
}
