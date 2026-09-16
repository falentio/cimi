export const EVENT_KINDS = [
  'page_view',
  'custom_event',
  'outbound',
  'performance',
  'error',
] as const

export type EventKind = (typeof EVENT_KINDS)[number]

export const EVENT_FIELDS = [
  'kind',
  'name',
  'pagePath',
  'referrer',
  'destination',
  'unit',
  'code',
] as const

export type EventField = (typeof EVENT_FIELDS)[number]
export type EventFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
export type EventFilterValue = string | number | boolean | null
export type EventFieldState = 'absent' | 'required' | 'nullable'

export const EVENT_FIELD_STATES = {
  page_view: {
    kind: 'required',
    name: 'absent',
    pagePath: 'required',
    referrer: 'nullable',
    destination: 'absent',
    unit: 'absent',
    code: 'absent',
  },
  custom_event: {
    kind: 'required',
    name: 'required',
    pagePath: 'nullable',
    referrer: 'nullable',
    destination: 'absent',
    unit: 'absent',
    code: 'absent',
  },
  outbound: {
    kind: 'required',
    name: 'nullable',
    pagePath: 'nullable',
    referrer: 'nullable',
    destination: 'required',
    unit: 'absent',
    code: 'absent',
  },
  performance: {
    kind: 'required',
    name: 'required',
    pagePath: 'nullable',
    referrer: 'nullable',
    destination: 'absent',
    unit: 'nullable',
    code: 'absent',
  },
  error: {
    kind: 'required',
    name: 'required',
    pagePath: 'nullable',
    referrer: 'nullable',
    destination: 'absent',
    unit: 'absent',
    code: 'nullable',
  },
} satisfies Readonly<Record<EventKind, Readonly<Record<EventField, EventFieldState>>>>

const EVENT_KIND_SET: ReadonlySet<string> = new Set(EVENT_KINDS)
const EVENT_FIELD_SET: ReadonlySet<string> = new Set(EVENT_FIELDS)

export function isEventKind(value: string): value is EventKind {
  return EVENT_KIND_SET.has(value)
}

export function isEventField(value: string): value is EventField {
  return EVENT_FIELD_SET.has(value)
}

export interface EventFilterCompatibilityInput {
  readonly field: string
  readonly operator: EventFilterOperator
  readonly values: readonly EventFilterValue[]
}

export interface PropertyFilterCompatibilityInput {
  readonly operator: EventFilterOperator
  readonly values: readonly EventFilterValue[]
}

export interface EventKindFilterCompatibilityInput extends EventFilterCompatibilityInput {
  readonly eventKind: EventKind
}

export function isCompatibleDirectEventFilter(input: EventFilterCompatibilityInput): boolean {
  if (!isEventField(input.field)) return false
  if (input.field === 'kind') {
    if (input.operator !== 'equals' && input.operator !== 'not_equals') return false
    return input.values.every((value) => typeof value === 'string' && EVENT_KIND_SET.has(value))
  }
  if (input.operator === 'contains') {
    return input.values.every((value) => typeof value === 'string')
  }
  if (input.operator === 'equals') {
    return input.values.every((value) => value === null || typeof value === 'string')
  }
  if (input.operator === 'not_equals') {
    return input.values.every((value) => typeof value === 'string')
  }
  return false
}

export function isCompatiblePropertyFilter(input: PropertyFilterCompatibilityInput): boolean {
  if (input.operator === 'contains') {
    return input.values.every((value) => typeof value === 'string')
  }
  if (input.operator === 'greater_than' || input.operator === 'less_than') {
    return input.values.every((value) => typeof value === 'number' && Number.isFinite(value))
  }
  return input.operator === 'equals' || input.operator === 'not_equals'
}

export function isCompatibleEventFilterForKind(input: EventKindFilterCompatibilityInput): boolean {
  if (!isEventField(input.field)) return false
  if (!isCompatibleDirectEventFilter(input)) return false
  const state = EVENT_FIELD_STATES[input.eventKind][input.field]
  if (state === 'absent') return false
  return state === 'nullable' || input.values.every((value) => value !== null)
}
