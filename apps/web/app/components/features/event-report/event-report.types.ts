import {
  Activity01Icon,
  Alert02Icon,
  Analytics01Icon,
  Chart01Icon,
  Link01Icon,
  UserGroupIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import type { Client } from '@cimi/client'

export type EventKind = Parameters<Client['eventReport']['getEventOverview']>[0]['eventKind']
export type EventMetric = 'events' | 'unique_visitors' | 'unique_sessions'
export type EventReportOperation = keyof Client['eventReport']
export type EventReportIcon = typeof Activity01Icon

export interface EventReportContextItem {
  readonly label: string
  readonly value: string
  readonly detail: string
}

export interface EventKindDescriptor {
  readonly kind: EventKind
  readonly label: string
  readonly description: string
  readonly icon: EventReportIcon
}

export interface EventMetricDescriptor {
  readonly id: EventMetric
  readonly label: string
  readonly description: string
  readonly displayValue: '--'
  readonly status: 'Not measured'
  readonly icon: EventReportIcon
}

export interface EventReportOperationDescriptor {
  readonly name: EventReportOperation
  readonly description: string
}

export interface EventReportPlaceholderViewModel {
  readonly state: 'contract-only'
  readonly context: readonly EventReportContextItem[]
  readonly eventKinds: readonly EventKindDescriptor[]
  readonly metrics: readonly EventMetricDescriptor[]
  readonly operations: readonly EventReportOperationDescriptor[]
}

const context = [
  {
    label: 'Calendar range',
    value: 'Inclusive Site-local dates',
    detail: 'Resolved through the Site reporting timezone.',
  },
  {
    label: 'Granularity',
    value: 'Hourly buckets',
    detail: 'Timeseries responses are bounded and zero-filled.',
  },
  {
    label: 'Comparison',
    value: 'Optional adjacent period',
    detail: 'Equal-length and adjacent to the current range.',
  },
] as const satisfies readonly EventReportContextItem[]

const eventKinds = [
  {
    kind: 'page_view',
    label: 'Page views',
    description: 'Viewed pages',
    icon: ViewIcon,
  },
  {
    kind: 'custom_event',
    label: 'Custom events',
    description: 'Named product actions',
    icon: Activity01Icon,
  },
  {
    kind: 'outbound',
    label: 'Outbound',
    description: 'Outbound interactions',
    icon: Link01Icon,
  },
  {
    kind: 'performance',
    label: 'Performance',
    description: 'Performance measurements',
    icon: Chart01Icon,
  },
  {
    kind: 'error',
    label: 'Errors',
    description: 'Sanitized error events',
    icon: Alert02Icon,
  },
] as const satisfies readonly EventKindDescriptor[]

const metrics = [
  {
    id: 'events',
    label: 'Events',
    description: 'Accepted Events in the selected range',
    displayValue: '--',
    status: 'Not measured',
    icon: Activity01Icon,
  },
  {
    id: 'unique_visitors',
    label: 'Unique visitors',
    description: 'Visitors with a matching Event',
    displayValue: '--',
    status: 'Not measured',
    icon: UserGroupIcon,
  },
  {
    id: 'unique_sessions',
    label: 'Unique sessions',
    description: 'Sessions with a matching Event',
    displayValue: '--',
    status: 'Not measured',
    icon: Analytics01Icon,
  },
] as const satisfies readonly EventMetricDescriptor[]

const operations = [
  {
    name: 'getEventOverview',
    description: 'Event and unique-context metrics',
  },
  {
    name: 'getEventTimeseries',
    description: 'Bounded event-count buckets',
  },
  {
    name: 'listEvents',
    description: 'Accepted Event exploration',
  },
  {
    name: 'getEventBreakdowns',
    description: 'Standard Event dimensions',
  },
] as const satisfies readonly EventReportOperationDescriptor[]

export const eventReportViewModel = {
  state: 'contract-only',
  context,
  eventKinds,
  metrics,
  operations,
} as const satisfies EventReportPlaceholderViewModel
