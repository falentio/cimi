export type PredicateTarget =
  | 'event.kind'
  | 'event.name'
  | 'event.pagePath'
  | 'event.referrer'
  | 'event.destination'
  | 'event.unit'
  | 'event.code'
  | 'event.property'
  | 'profile.trait'
  | 'session.device'
  | 'session.browser'
  | 'session.os'
  | 'session.country'
  | 'session.region'
  | 'session.city'
  | 'session.entryPage'
  | 'session.exitPage'
  | 'session.utmSource'
  | 'session.utmMedium'
  | 'session.utmCampaign'
  | 'visitor.identityKind'

export type PredicateOperator = 'eq' | 'neq' | 'contains' | 'gt' | 'lt'

export type PredicateValue = string | number | boolean | null

export type EventKind = 'page_view' | 'custom_event' | 'outbound' | 'performance' | 'error'

/**
 * One allowlisted filter over a semantic column or json property.
 *
 * `bind.length > 1` means OR over the bound values; separate Predicates are ANDed together. The
 * adapter implements that contract when rendering SQL.
 */
export interface Predicate {
  readonly target: PredicateTarget
  readonly propertyKey: string | null
  readonly operator: PredicateOperator
  readonly bind: readonly PredicateValue[]
}

export interface PropertyFilter {
  readonly key: string
  readonly operator: PredicateOperator
  readonly bind: readonly PredicateValue[]
}

/**
 * `has_done`/`has_not_done` asks whether an actor performed an action. The actor and the time
 * window differ by report family: traffic asks about the Visitor across its whole history, event
 * reports ask about the Analytics Session within the report range (`range: same_range`). The scope
 * is modeled so the two cannot be conflated in SQL.
 */
export interface PresencePredicate {
  readonly scope: 'visitor' | 'session'
  readonly withinPeriod: boolean
  readonly action: EventKind
  readonly name: string | null
  readonly propertyFilters: readonly PropertyFilter[]
  readonly negated: boolean
}

export interface ReportFilterPlan {
  readonly event: readonly Predicate[]
  readonly session: readonly Predicate[]
  readonly visitor: readonly Predicate[]
  readonly profile: readonly Predicate[]
  readonly profileTraitKeys: readonly string[]
  readonly sessionPresence: readonly PresencePredicate[]
  readonly requiresProfileJoin: boolean
}

/**
 * A filter the store cannot serve is a caller error, not a transient failure. The adapter throws
 * this so the resource maps it to BAD_REQUEST instead of a misleading SERVICE_UNAVAILABLE.
 */
export class ReportingQueryUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReportingQueryUnsupportedError'
  }
}
