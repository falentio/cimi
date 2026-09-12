import type {
  EventKind,
  Predicate,
  PredicateOperator,
  PredicateTarget,
  PredicateValue,
  PresencePredicate,
  PropertyFilter,
  ReportFilterPlan,
} from './types.ts'

type ContractOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than'

interface TrafficAttributeFilter {
  readonly scope: 'event' | 'session' | 'visitor' | 'profile'
  readonly field: string
  readonly operator: ContractOperator
  readonly values: readonly PredicateValue[]
}

interface TrafficAction {
  readonly kind: EventKind
  readonly name?: string | undefined
}

interface TrafficPresenceFilter {
  readonly scope: 'visitor'
  readonly operator: 'has_done' | 'has_not_done'
  readonly action: TrafficAction
}

export type TrafficFilterInput = TrafficAttributeFilter | TrafficPresenceFilter

function isTrafficPresenceFilter(filter: TrafficFilterInput): filter is TrafficPresenceFilter {
  const operator: string = filter.operator
  return operator === 'has_done' || operator === 'has_not_done'
}

interface EventValueFilter {
  readonly scope: 'event'
  readonly field: string
  readonly operator: ContractOperator
  readonly values: readonly PredicateValue[]
}

interface EventPropertyFilter {
  readonly key: string
  readonly operator: ContractOperator
  readonly values: readonly PredicateValue[]
}

interface EventMatchAction {
  readonly kind: EventKind
  readonly name?: string | undefined
  readonly propertyFilters?: readonly EventPropertyFilter[] | undefined
}

interface EventPresenceFilter {
  readonly scope: 'session'
  readonly operator: 'has_done' | 'has_not_done'
  readonly action: EventMatchAction
}

export type EventFilterInput = EventValueFilter | EventPresenceFilter

export interface CompileTrafficFilterInput {
  readonly filters: readonly TrafficFilterInput[]
  readonly profileFilterKeys: readonly string[]
}

export interface CompileEventFilterInput {
  readonly filters: readonly EventFilterInput[]
  readonly profileFilterKeys: readonly string[]
}

export type CompileFailureReason = 'unsupported-field' | 'unapproved-trait' | 'incompatible-value'

export type CompileFilterResult =
  | { readonly ok: true; readonly plan: ReportFilterPlan }
  | { readonly ok: false; readonly reason: CompileFailureReason }

const PROPERTY_KEY_PATTERN = /^property\.([A-Za-z0-9_.-]{1,63})$/
const EVENT_KINDS: readonly EventKind[] = [
  'page_view',
  'custom_event',
  'outbound',
  'performance',
  'error',
]

const OPERATOR_MAP: Readonly<Record<ContractOperator, PredicateOperator>> = {
  equals: 'eq',
  not_equals: 'neq',
  contains: 'contains',
  greater_than: 'gt',
  less_than: 'lt',
}

const TRAFFIC_EVENT_TARGETS: Readonly<Record<string, PredicateTarget>> = {
  kind: 'event.kind',
  name: 'event.name',
  pagePath: 'event.pagePath',
  referrer: 'event.referrer',
  destination: 'event.destination',
  unit: 'event.unit',
  code: 'event.code',
}

const TRAFFIC_SESSION_TARGETS: Readonly<Record<string, PredicateTarget>> = {
  device: 'session.device',
  browser: 'session.browser',
  os: 'session.os',
  country: 'session.country',
  region: 'session.region',
  city: 'session.city',
  entryPage: 'session.entryPage',
  exitPage: 'session.exitPage',
  utmSource: 'session.utmSource',
  utmMedium: 'session.utmMedium',
  utmCampaign: 'session.utmCampaign',
}

const EVENT_TARGETS: Readonly<Record<string, PredicateTarget>> = {
  kind: 'event.kind',
  name: 'event.name',
  pagePath: 'event.pagePath',
  referrer: 'event.referrer',
  destination: 'event.destination',
  unit: 'event.unit',
  code: 'event.code',
}

const TRAIT_KEY_PATTERN = /^trait\.([A-Za-z0-9_.-]{1,63})$/

function isFiniteNumber(value: PredicateValue): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

function isKindValue(value: PredicateValue): boolean {
  return EVENT_KINDS.includes(value as EventKind)
}

/**
 * Mirrors the contract's compatibility rules per field family. A boolean is a legitimate `eq`/`neq`
 * bind for a string column, so those operators accept any non-null scalar; only `contains` and the
 * ordering operators narrow the value type.
 */
function isCompatibleValue(
  family: 'event' | 'session' | 'visitor',
  operator: ContractOperator,
  values: readonly PredicateValue[],
): boolean {
  if (operator === 'contains') {
    return values.every((value) => typeof value === 'string')
  }
  if (operator === 'greater_than' || operator === 'less_than') {
    return values.every(isFiniteNumber)
  }
  if (family === 'visitor') {
    return values.every((value) => value === 'visitor' || value === 'identified_user')
  }
  return values.every((value) => typeof value === 'string')
}

/**
 * Property filters accept any scalar for `eq`/`neq` because a json property is untyped; only the
 * narrowing operators constrain the value.
 */
function isCompatiblePropertyValue(
  operator: ContractOperator,
  values: readonly PredicateValue[],
): boolean {
  if (operator === 'contains') {
    return values.every((value) => typeof value === 'string')
  }
  if (operator === 'greater_than' || operator === 'less_than') {
    return values.every(isFiniteNumber)
  }
  return true
}

function emptyPlan(): ReportFilterPlan {
  return {
    event: [],
    session: [],
    visitor: [],
    profile: [],
    profileTraitKeys: [],
    sessionPresence: [],
    requiresProfileJoin: false,
  }
}

export function compileTrafficFilterPlan(input: CompileTrafficFilterInput): CompileFilterResult {
  const event: Predicate[] = []
  const session: Predicate[] = []
  const visitor: Predicate[] = []
  const profile: Predicate[] = []
  const profileTraitKeys: string[] = []
  const sessionPresence: PresencePredicate[] = []

  for (const filter of input.filters) {
    if (isTrafficPresenceFilter(filter)) {
      sessionPresence.push({
        action: filter.action.kind,
        name: filter.action.name ?? null,
        propertyFilters: [],
        negated: filter.operator === 'has_not_done',
      })
      continue
    }

    const { scope, field, operator, values } = filter
    const predicateOperator = OPERATOR_MAP[operator]

    if (scope === 'profile') {
      const match = TRAIT_KEY_PATTERN.exec(field)
      if (match === null) return { ok: false, reason: 'unsupported-field' }
      const key = match[1] ?? ''
      if (!input.profileFilterKeys.includes(key)) return { ok: false, reason: 'unapproved-trait' }
      if (!isCompatiblePropertyValue(operator, values)) {
        return { ok: false, reason: 'incompatible-value' }
      }
      profile.push({
        target: 'profile.trait',
        propertyKey: key,
        operator: predicateOperator,
        bind: values,
      })
      profileTraitKeys.push(key)
      continue
    }

    if (scope === 'event' || scope === 'session' || scope === 'visitor') {
      const targets =
        scope === 'event'
          ? TRAFFIC_EVENT_TARGETS
          : scope === 'session'
            ? TRAFFIC_SESSION_TARGETS
            : undefined
      if (targets === undefined) {
        if (field !== 'identityKind') return { ok: false, reason: 'unsupported-field' }
        if (!isCompatibleValue('visitor', operator, values)) {
          return { ok: false, reason: 'incompatible-value' }
        }
        visitor.push({
          target: 'visitor.identityKind',
          propertyKey: null,
          operator: predicateOperator,
          bind: values,
        })
        continue
      }
      const target = targets[field]
      if (target === undefined) return { ok: false, reason: 'unsupported-field' }
      if (field === 'kind') {
        if (!values.every(isKindValue)) return { ok: false, reason: 'incompatible-value' }
      } else if (!isCompatibleValue(scope, operator, values)) {
        return { ok: false, reason: 'incompatible-value' }
      }
      const predicate: Predicate = {
        target,
        propertyKey: null,
        operator: predicateOperator,
        bind: values,
      }
      if (scope === 'event') event.push(predicate)
      else session.push(predicate)
      continue
    }
  }

  const plan: ReportFilterPlan = {
    ...emptyPlan(),
    event,
    session,
    visitor,
    profile,
    profileTraitKeys,
    sessionPresence,
    requiresProfileJoin: profile.length > 0,
  }
  return { ok: true, plan }
}

export function compileEventFilterPlan(input: CompileEventFilterInput): CompileFilterResult {
  const event: Predicate[] = []
  const sessionPresence: PresencePredicate[] = []

  for (const filter of input.filters) {
    if ('scope' in filter && filter.scope === 'session') {
      const propertyFilters: PropertyFilter[] = []
      for (const property of filter.action.propertyFilters ?? []) {
        if (!isCompatiblePropertyValue(property.operator, property.values)) {
          return { ok: false, reason: 'incompatible-value' }
        }
        propertyFilters.push({
          key: property.key,
          operator: OPERATOR_MAP[property.operator],
          bind: property.values,
        })
      }
      sessionPresence.push({
        action: filter.action.kind,
        name: filter.action.name ?? null,
        propertyFilters,
        negated: filter.operator === 'has_not_done',
      })
      continue
    }

    const { field, operator, values } = filter
    const predicateOperator = OPERATOR_MAP[operator]
    const propertyMatch = PROPERTY_KEY_PATTERN.exec(field)
    if (propertyMatch !== null) {
      if (!isCompatiblePropertyValue(operator, values)) {
        return { ok: false, reason: 'incompatible-value' }
      }
      event.push({
        target: 'event.property',
        propertyKey: propertyMatch[1] ?? '',
        operator: predicateOperator,
        bind: values,
      })
      continue
    }
    const target = EVENT_TARGETS[field]
    if (target === undefined) return { ok: false, reason: 'unsupported-field' }
    if (field === 'kind') {
      if (!values.every(isKindValue)) return { ok: false, reason: 'incompatible-value' }
    } else if (!isCompatibleValue('event', operator, values)) {
      return { ok: false, reason: 'incompatible-value' }
    }
    event.push({ target, propertyKey: null, operator: predicateOperator, bind: values })
  }

  const plan: ReportFilterPlan = { ...emptyPlan(), event, sessionPresence }
  return { ok: true, plan }
}
