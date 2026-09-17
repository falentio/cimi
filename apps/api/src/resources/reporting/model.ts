import type {
  AnalyticsReportEvent,
  AnalyticsReportScalar,
  AnalyticsReportSession,
  JsonObject,
} from '@cimi/db'
import type { InferOutput } from 'valibot'
import { schema as contractSchema } from '@cimi/contract'
import type { ResolvedPeriod } from '@cimi/kernel'
import { readProfileTrait, type ReportingProfileTraits } from './profiles.ts'

export type PropertyFilter = InferOutput<typeof contractSchema.SPropertyFilter>
export type ReportFilter = NonNullable<
  InferOutput<typeof contractSchema.SReportFieldsSchema>['filters']
>[number]
export type ActionMatcher = InferOutput<typeof contractSchema.SFunnelAction>
export type EventKind = InferOutput<typeof contractSchema.SEventKind>

export type ReportEvent = Omit<AnalyticsReportEvent, 'eventKind'> & {
  readonly eventKind: EventKind
}

export type ReportSession = AnalyticsReportSession

export interface ReportProfile {
  readonly identifiedUserId: string
  readonly traits: JsonObject
}

export interface ReportSnapshot {
  readonly events: readonly ReportEvent[]
  readonly sessions: readonly ReportSession[]
  readonly activeProfiles: ReadonlyMap<string, ReportProfile>
}

export interface IdentityScope {
  readonly kind: 'visitor' | 'identified_user'
  readonly subjectOfEvent: (event: ReportEvent) => string | null
  readonly subjectOfSession: (session: ReportSession) => string | null
  readonly sessionIsEligible: (session: ReportSession) => boolean
}

export interface EvaluationPeriod {
  readonly period: ResolvedPeriod
  readonly sequence: readonly ResolvedPeriod[] | null
}

export function matchesAction(
  event: ReportEvent,
  action: ActionMatcher,
  propertyFilters: readonly PropertyFilter[] | undefined = action.propertyFilters,
): boolean {
  if (event.eventKind !== action.kind) return false
  if (action.kind !== 'page_view' && action.kind !== 'outbound' && event.name !== action.name) {
    return false
  }
  if (action.kind === 'outbound' && action.name !== undefined && event.name !== action.name) {
    return false
  }
  return matchesPropertyFilters(event.properties, propertyFilters)
}

export function matchesPropertyFilters(
  properties: Readonly<Record<string, AnalyticsReportScalar>>,
  filters: readonly PropertyFilter[] | undefined,
): boolean {
  return (
    filters?.every((filter) => {
      const value = properties[filter.field]
      return filter.values.some((expected) => matchesValue(value, filter.operator, expected))
    }) ?? true
  )
}

export function matchesReportFilters(input: {
  readonly session: ReportSession
  readonly events: readonly ReportEvent[]
  readonly filters: readonly ReportFilter[] | undefined
  readonly period: ResolvedPeriod
  readonly profileTraits: ReportingProfileTraits
}): boolean {
  const events = input.events.filter((event) => eventInPeriod(event, input.period))
  return (
    input.filters?.every((filter) => {
      if (filter.operator === 'has_done' || filter.operator === 'has_not_done') {
        const matched = events.some((event) => matchesAction(event, filter.action))
        return filter.operator === 'has_done' ? matched : !matched
      }
      if (!('values' in filter)) return false
      if (filter.scope === 'event') {
        return events.some((event) =>
          matchesValue(eventField(event, filter.field), filter.operator, filter.values),
        )
      }
      if (filter.scope === 'session') {
        return matchesValue(
          sessionField(input.session, filter.field),
          filter.operator,
          filter.values,
        )
      }
      if (filter.scope === 'visitor') {
        return matchesValue(
          input.session.identifiedUserId !== null &&
            input.profileTraits.has(input.session.identifiedUserId)
            ? 'identified_user'
            : 'visitor',
          filter.operator,
          filter.values,
        )
      }
      const identifiedUserId = input.session.identifiedUserId
      const profile =
        identifiedUserId === null ? undefined : input.profileTraits.get(identifiedUserId)
      if (profile === undefined) return false
      return matchesValue(readProfileTrait(profile, filter.field), filter.operator, filter.values)
    }) ?? true
  )
}

export function eventInPeriod(event: ReportEvent, period: ResolvedPeriod): boolean {
  const occurrence = event.occurrenceTime.getTime()
  return occurrence >= period.interval.start && occurrence < period.interval.endExclusive
}

export function sessionInPeriod(session: ReportSession, period: ResolvedPeriod): boolean {
  const end = session.endedAt?.getTime() ?? session.startedAt.getTime()
  return end >= period.interval.start && session.startedAt.getTime() < period.interval.endExclusive
}

function eventField(
  event: ReportEvent,
  field: Extract<ReportFilter, { scope: 'event' }>['field'],
): AnalyticsReportScalar {
  switch (field) {
    case 'kind':
      return event.eventKind
    case 'name':
      return event.name
    case 'pagePath':
      return event.pagePath
    case 'referrer':
      return event.referrer
    case 'destination':
      return event.destination
    case 'unit':
      return event.unit
    case 'code':
      return event.code
  }
}

function sessionField(
  session: ReportSession,
  field: Extract<ReportFilter, { scope: 'session' }>['field'],
): AnalyticsReportScalar {
  switch (field) {
    case 'device':
      return session.device
    case 'browser':
      return session.browser
    case 'os':
      return session.operatingSystem
    case 'country':
      return session.country
    case 'region':
      return session.region
    case 'city':
      return session.city
    case 'entryPage':
      return session.entryPage
    case 'exitPage':
      return session.exitPage
    case 'utmSource':
      return session.utmSource
    case 'utmMedium':
      return session.utmMedium
    case 'utmCampaign':
      return session.utmCampaign
  }
}

function matchesValue(
  actual: AnalyticsReportScalar | undefined,
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than',
  expected: AnalyticsReportScalar | readonly AnalyticsReportScalar[],
): boolean {
  if (Array.isArray(expected)) {
    return expected.some((value) => matchesValue(actual, operator, value))
  }
  if (actual === undefined) return false
  if (operator === 'equals') return actual === expected
  if (operator === 'not_equals') return actual !== expected
  if (operator === 'contains') {
    return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)
  }
  if (typeof actual !== 'number' || typeof expected !== 'number') return false
  return operator === 'greater_than' ? actual > expected : actual < expected
}

export function toJsonObject(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected a JSON object')
  }
  const object: JsonObject = {}
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) object[key] = toJsonValue(child)
  }
  return object
}

export function toJsonValue(value: unknown): import('@cimi/db').JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Expected a finite JSON number')
    return value
  }
  if (Array.isArray(value)) return value.map(toJsonValue)
  return toJsonObject(value)
}
