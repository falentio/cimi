import { ComputerIcon, File01Icon, GlobalIcon, Link01Icon } from '@hugeicons/core-free-icons'
import type {
  OverviewBreakdownDimension,
  OverviewBreakdownSectionId,
  OverviewBreakdownTabView,
  OverviewFilter,
  OverviewIcon,
} from './site-overview.types'

export { type OverviewBreakdownSectionId } from './site-overview.types'

export interface OverviewBreakdownTabDescriptor {
  readonly id: string
  readonly label: string
  readonly dimension: OverviewBreakdownDimension
  /** Turns a breakdown row back into the allowlisted filter that narrows the page to it. */
  readonly rowFilter: (value: string) => OverviewFilter
}

export interface OverviewBreakdownSectionDescriptor {
  readonly id: OverviewBreakdownSectionId
  readonly title: string
  readonly subtitle: string
  readonly icon: OverviewIcon
  readonly tabs: readonly OverviewBreakdownTabDescriptor[]
}

function eventFilter(field: 'pagePath' | 'referrer', value: string): OverviewFilter {
  return { scope: 'event', field, operator: 'equals', values: [value] }
}

function sessionFilter(
  field: 'country' | 'region' | 'device' | 'browser',
  value: string,
): OverviewFilter {
  return { scope: 'session', field, operator: 'equals', values: [value] }
}

/**
 * The breakdown cards the contract's dimension allowlist can fill. A tab whose dimension the
 * contract does not list is absent here rather than rendered as an inert placeholder.
 */
export const overviewBreakdownSections: readonly OverviewBreakdownSectionDescriptor[] = [
  {
    id: 'pages',
    title: 'Top pages',
    subtitle: 'Most viewed paths',
    icon: File01Icon,
    tabs: [
      {
        id: 'pages',
        label: 'Pages',
        dimension: 'page',
        rowFilter: (value) => eventFilter('pagePath', value),
      },
    ],
  },
  {
    id: 'referrers',
    title: 'Referrers',
    subtitle: 'Where visitors came from',
    icon: Link01Icon,
    tabs: [
      {
        id: 'referrers',
        label: 'Referrers',
        dimension: 'referrer',
        rowFilter: (value) => eventFilter('referrer', value),
      },
    ],
  },
  {
    id: 'countries',
    title: 'Countries',
    subtitle: 'Visitors by location',
    icon: GlobalIcon,
    tabs: [
      {
        id: 'countries',
        label: 'Countries',
        dimension: 'country',
        rowFilter: (value) => sessionFilter('country', value),
      },
      {
        id: 'regions',
        label: 'Regions',
        dimension: 'region',
        rowFilter: (value) => sessionFilter('region', value),
      },
    ],
  },
  {
    id: 'devices',
    title: 'Devices',
    subtitle: 'How visitors browse',
    icon: ComputerIcon,
    tabs: [
      {
        id: 'devices',
        label: 'Devices',
        dimension: 'device',
        rowFilter: (value) => sessionFilter('device', value),
      },
      {
        id: 'browsers',
        label: 'Browsers',
        dimension: 'browser',
        rowFilter: (value) => sessionFilter('browser', value),
      },
    ],
  },
]

export function findOverviewBreakdownSection(
  id: string,
): OverviewBreakdownSectionDescriptor | undefined {
  return overviewBreakdownSections.find((section) => section.id === id)
}

export function findOverviewBreakdownTab(
  sectionId: string,
  tabId: string,
): OverviewBreakdownTabDescriptor | undefined {
  return findOverviewBreakdownSection(sectionId)?.tabs.find((tab) => tab.id === tabId)
}

export function overviewBreakdownTabViews(
  section: OverviewBreakdownSectionDescriptor,
): readonly OverviewBreakdownTabView[] {
  return section.tabs.map((tab) => ({ id: tab.id, label: tab.label }))
}
