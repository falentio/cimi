import { Globe02Icon, Home01Icon, ShieldKeyIcon } from '@hugeicons/core-free-icons'

export interface NavItem {
  readonly title: string
  readonly to: string
  readonly icon: typeof Home01Icon
  readonly admin?: true
  readonly exact?: true
}

export interface NavGroup {
  readonly label?: string
  readonly items: readonly NavItem[]
}

export interface NavRegistry {
  readonly main: NavGroup
  readonly sites: NavGroup
  readonly secondary: NavGroup
}

export const NAV_REGISTRY: NavRegistry = {
  main: {
    items: [{ title: 'Sites', to: '/', icon: Home01Icon }],
  },
  sites: {
    label: 'Sites',
    items: [{ title: 'Example Site', to: '/sites/example-site', icon: Globe02Icon }],
  },
  secondary: {
    items: [{ title: 'Admin', to: '/admin', icon: ShieldKeyIcon, admin: true }],
  },
}

export function isNavItemActive(currentPath: string, item: Pick<NavItem, 'to' | 'exact'>): boolean {
  if (item.exact === true) return currentPath === item.to
  if (item.to === '/') return currentPath === '/'
  return currentPath === item.to || currentPath.startsWith(`${item.to}/`)
}
