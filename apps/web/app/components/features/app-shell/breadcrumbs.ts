export interface BreadcrumbSegment {
  readonly label: string
  readonly to?: string
}

interface BreadcrumbRule {
  readonly pattern: string
  readonly segments: readonly BreadcrumbSegment[]
}

const SITE_TRAIL: readonly BreadcrumbSegment[] = [
  { label: 'Sites', to: '/' },
  { label: ':siteId', to: '/sites/:siteId' },
]

const SITE_SETTINGS_TRAIL: readonly BreadcrumbSegment[] = [
  ...SITE_TRAIL,
  { label: 'Settings', to: '/sites/:siteId/settings' },
]

const ORG_SETTINGS_TRAIL: readonly BreadcrumbSegment[] = [{ label: 'Settings', to: '/settings' }]

const ADMIN_TRAIL: readonly BreadcrumbSegment[] = [{ label: 'Admin', to: '/admin' }]

const RULES: readonly BreadcrumbRule[] = [
  { pattern: '/', segments: [{ label: 'Sites' }] },
  { pattern: '/sites/:siteId', segments: SITE_TRAIL },
  { pattern: '/sites/:siteId/events', segments: [...SITE_TRAIL, { label: 'Events' }] },
  { pattern: '/sites/:siteId/goals', segments: [...SITE_TRAIL, { label: 'Goals' }] },
  { pattern: '/sites/:siteId/funnels', segments: [...SITE_TRAIL, { label: 'Funnels' }] },
  { pattern: '/sites/:siteId/cohorts', segments: [...SITE_TRAIL, { label: 'Cohorts' }] },
  {
    pattern: '/sites/:siteId/settings/general',
    segments: [...SITE_SETTINGS_TRAIL, { label: 'General' }],
  },
  {
    pattern: '/sites/:siteId/settings/retention',
    segments: [...SITE_SETTINGS_TRAIL, { label: 'Retention' }],
  },
  {
    pattern: '/sites/:siteId/settings/danger',
    segments: [...SITE_SETTINGS_TRAIL, { label: 'Danger' }],
  },
  {
    pattern: '/sites/:siteId/settings/collection',
    segments: [...SITE_SETTINGS_TRAIL, { label: 'Collection' }],
  },
  {
    pattern: '/sites/:siteId/settings/public-dashboard',
    segments: [...SITE_SETTINGS_TRAIL, { label: 'Public Dashboard' }],
  },
  { pattern: '/settings/general', segments: [...ORG_SETTINGS_TRAIL, { label: 'General' }] },
  { pattern: '/settings/members', segments: [...ORG_SETTINGS_TRAIL, { label: 'Members' }] },
  { pattern: '/settings/danger', segments: [...ORG_SETTINGS_TRAIL, { label: 'Danger' }] },
  { pattern: '/settings/account', segments: [...ORG_SETTINGS_TRAIL, { label: 'Account' }] },
  { pattern: '/admin', segments: [{ label: 'Admin' }] },
  { pattern: '/admin/retention', segments: [...ADMIN_TRAIL, { label: 'Retention' }] },
  { pattern: '/admin/backup-restore', segments: [...ADMIN_TRAIL, { label: 'Backup Restore' }] },
]

export function resolveBreadcrumbs(path: string): BreadcrumbSegment[] {
  const pathSegments = path.split('/').filter(Boolean)

  for (const rule of RULES) {
    const params = matchRule(rule.pattern, pathSegments)
    if (params !== null) {
      return rule.segments.map((segment) => buildSegment(segment, params))
    }
  }

  return []
}

function matchRule(
  pattern: string,
  pathSegments: readonly string[],
): Record<string, string> | null {
  const patternSegments = pattern.split('/').filter(Boolean)
  if (patternSegments.length !== pathSegments.length) return null

  const params: Record<string, string> = {}
  for (const [index, segment] of patternSegments.entries()) {
    if (segment.startsWith(':')) {
      const value = pathSegments[index]
      if (value === undefined) return null
      params[segment.slice(1)] = value
    } else if (segment !== pathSegments[index]) {
      return null
    }
  }
  return params
}

function buildSegment(
  segment: BreadcrumbSegment,
  params: Record<string, string>,
): BreadcrumbSegment {
  const label = interpolate(segment.label, params)
  if (segment.to === undefined) return { label }
  return { label, to: interpolate(segment.to, params) }
}

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/:([A-Za-z]+)/g, (match, name) => params[name] ?? match)
}
