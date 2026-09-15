import {
  Activity01Icon,
  Analytics01Icon,
  Chart01Icon,
  Link01Icon,
  Settings01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import type { NavGroup, NavItem } from './nav-config'

type SiteSectionSegment = '' | 'events' | 'goals' | 'funnels' | 'cohorts' | 'settings'

interface SiteSectionDefinition {
  readonly title: string
  readonly segment: SiteSectionSegment
  readonly icon: NavItem['icon']
  readonly exact?: true
}

export interface CreateSiteSectionNavInput {
  readonly siteId: string
  readonly label: string
}

const SITE_SECTION_DEFINITIONS = [
  { title: 'Overview', segment: '', icon: Analytics01Icon, exact: true },
  { title: 'Events', segment: 'events', icon: Activity01Icon },
  { title: 'Goals', segment: 'goals', icon: Chart01Icon },
  { title: 'Funnels', segment: 'funnels', icon: Link01Icon },
  { title: 'Cohorts', segment: 'cohorts', icon: UserGroupIcon },
  { title: 'Settings', segment: 'settings', icon: Settings01Icon },
] satisfies readonly SiteSectionDefinition[]

export function createSiteSectionNav(input: CreateSiteSectionNavInput): NavGroup {
  const base = `/sites/${input.siteId}`

  return {
    label: input.label,
    items: SITE_SECTION_DEFINITIONS.map(({ segment, ...item }) => ({
      ...item,
      to: segment === '' ? base : `${base}/${segment}`,
    })),
  }
}
