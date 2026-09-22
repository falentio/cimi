import { REPORT_FACT_WORK_BUDGETS, schema as contractSchema } from '@cimi/contract'
import {
  ReportingAdmissionService,
  createCalendarDate,
  createSiteId,
  serviceUnavailable,
  type CoverageDependency,
  type FreshnessEvidence,
  type LifecycleLease,
  type LifecycleLock,
  type PeriodKey,
  type PeriodizationByKey,
  type ReportAdmissionPreparation,
  type ReportAdmissionPreparationInput,
  type ReportAdmissionTicket,
  type ReportEvaluationPeriod,
  type ReportWorkDemand,
  type ResolvedPeriod,
} from '@cimi/kernel'
import type { InferOutput } from 'valibot'
import type { EvaluationPeriod, IdentityScope, ReportFilter, ReportSnapshot } from './model.ts'
import type { ReportEvaluationInput } from './evaluation.ts'
import { toOrpcReportingError } from './errors.ts'

export type ReportWindow = InferOutput<typeof contractSchema.SReportFieldsSchema>
export type ReportIdentityKind = 'visitor' | 'identified_user'

export interface ReportDataPort {
  read(input: {
    readonly siteId: string
    readonly from: number
    readonly toExclusive: number
  }): Promise<ReportSnapshot>
}

export interface StatefulReportWork {
  readonly extraMetricCount: number
  readonly distinctCountOperations: number
}

export function goalReportWork(): StatefulReportWork {
  return { extraMetricCount: 1, distinctCountOperations: 1 }
}

export function funnelReportWork(stepCount: number): StatefulReportWork {
  return { extraMetricCount: stepCount, distinctCountOperations: stepCount }
}

export function cohortReportWork(): StatefulReportWork {
  return { extraMetricCount: 1, distinctCountOperations: 1 }
}

export interface HistoricalDefinition<T> {
  readonly definition: T
  readonly identityKind: ReportIdentityKind
}

export interface HistoricalDefinitionPlan<T> {
  readonly current: HistoricalDefinition<T>
  readonly comparison: HistoricalDefinition<T> | null
  readonly all: readonly HistoricalDefinition<T>[]
}

export interface ReportQueryPlanningContext {
  prepare(input?: {
    readonly periodization?: PeriodizationByKey
  }): Promise<ReportAdmissionPreparation>
}

export interface ReportQueryPlan<T> {
  readonly preparation: ReportAdmissionPreparation
  readonly coverage: readonly CoverageDependency[]
  readonly work: StatefulReportWork
  readonly identityKindFor: (period: ReportEvaluationPeriod) => ReportIdentityKind
  readonly identityKindForPeriod?: (
    period: ReportEvaluationPeriod,
    nestedPeriod: ResolvedPeriod,
  ) => ReportIdentityKind
  readonly evaluate: (input: ReportEvaluationInput) => T | PromiseLike<T>
}

interface ReportQueryInput<T, TResult> {
  readonly siteId: string
  readonly window: ReportWindow
  readonly plan: (context: ReportQueryPlanningContext) => Promise<ReportQueryPlan<T>>
  readonly render: (run: ReportRun<T>) => TResult | PromiseLike<TResult>
}

export interface ReportRun<T> {
  readonly current: {
    readonly period: EvaluationPeriod
    readonly value: T
    readonly freshness: FreshnessEvidence
  }
  readonly comparison: {
    readonly period: EvaluationPeriod
    readonly value: T
    readonly freshness: FreshnessEvidence
  } | null
}

export interface ReportQueryKernel {
  run<T, TResult>(input: {
    readonly siteId: string
    readonly window: ReportWindow
    readonly plan: (context: ReportQueryPlanningContext) => Promise<ReportQueryPlan<T>>
    readonly render: (run: ReportRun<T>) => TResult | PromiseLike<TResult>
  }): Promise<TResult>
}

export interface ReportQueryKernelDependencies {
  readonly admission: ReportingAdmissionService
  readonly data: ReportDataPort
  readonly lifecycleLock: LifecycleLock
}

export function createReportQueryKernel(
  dependencies: ReportQueryKernelDependencies,
): ReportQueryKernel {
  return {
    run: async <T, TResult>(input: ReportQueryInput<T, TResult>): Promise<TResult> => {
      let lease: LifecycleLease | undefined
      let outcome:
        | { readonly kind: 'success'; readonly value: TResult }
        | { readonly kind: 'failure'; readonly error: unknown }
      try {
        lease = await dependencies.lifecycleLock.acquire('analytics-read')
        if (lease === undefined) throw serviceUnavailable('lifecycle-locked')

        const planning = {
          prepare: (options: { readonly periodization?: PeriodizationByKey } = {}) =>
            dependencies.admission.prepare(
              createPreparationInput(input.siteId, input.window, options.periodization),
            ),
        }
        const plan = await input.plan(planning)
        const ticket = await dependencies.admission.admitPrepared(plan.preparation, {
          coverage: plan.coverage,
          work: createAdmissionWork(input.window.filters, plan.work),
        })
        const snapshot = await dependencies.data.read({
          siteId: input.siteId,
          from: ticket.evaluation.interval.start,
          toExclusive: ticket.evaluation.interval.endExclusive,
        })
        const identityKindForPeriod = plan.identityKindForPeriod
        const createIdentityForPeriod = (period: ReportEvaluationPeriod) =>
          identityKindForPeriod === undefined
            ? undefined
            : (nestedPeriod: ResolvedPeriod) =>
                createIdentityScope(identityKindForPeriod(period, nestedPeriod), snapshot)
        const currentIdentityForPeriod = createIdentityForPeriod(ticket.evaluation.current)
        const current = await evaluatePeriod({
          ticket,
          snapshot,
          identity: createIdentityScope(plan.identityKindFor(ticket.evaluation.current), snapshot),
          identityForPeriod: currentIdentityForPeriod,
          filters: input.window.filters,
          evaluate: plan.evaluate,
          period: ticket.evaluation.current,
        })
        const comparisonPeriod = ticket.evaluation.comparison
        const comparison =
          comparisonPeriod === null
            ? null
            : await evaluatePeriod({
                ticket,
                snapshot,
                identity: createIdentityScope(plan.identityKindFor(comparisonPeriod), snapshot),
                identityForPeriod: createIdentityForPeriod(comparisonPeriod),
                filters: input.window.filters,
                evaluate: plan.evaluate,
                period: comparisonPeriod,
              })
        outcome = { kind: 'success', value: await input.render({ current, comparison }) }
      } catch (error) {
        outcome = { kind: 'failure', error }
      }
      try {
        await lease?.release()
      } catch (error) {
        throw toOrpcReportingError(error)
      }
      if (outcome.kind === 'failure') throw toOrpcReportingError(outcome.error)
      return outcome.value
    },
  }
}

export function historicalDefinitionFor<T>(
  plan: HistoricalDefinitionPlan<T>,
  key: PeriodKey,
): HistoricalDefinition<T> {
  if (key === 'current') return plan.current
  if (plan.comparison === null) throw new Error('Comparison definition is not planned')
  return plan.comparison
}

export function coverageForDefinitions(input: {
  readonly definitions: readonly { readonly identityKind: ReportIdentityKind }[]
  readonly filters: readonly ReportFilter[] | undefined
}): readonly CoverageDependency[] {
  return [
    'event-occurrence',
    ...(input.definitions.some(({ identityKind }) => identityKind === 'identified_user') ||
    input.filters?.some((filter) => filter.scope === 'profile')
      ? (['profile-activity'] as const)
      : []),
  ]
}

async function evaluatePeriod<T>(input: {
  readonly ticket: ReportAdmissionTicket
  readonly snapshot: ReportSnapshot
  readonly identity: IdentityScope
  readonly identityForPeriod: ((period: ResolvedPeriod) => IdentityScope) | undefined
  readonly filters: readonly ReportFilter[] | undefined
  readonly evaluate: (input: ReportEvaluationInput) => T | PromiseLike<T>
  readonly period: ReportEvaluationPeriod
}): Promise<ReportRun<T>['current']> {
  return {
    period: input.period,
    value: await input.evaluate({
      period: input.period,
      snapshot: input.snapshot,
      identity: input.identity,
      ...(input.identityForPeriod === undefined
        ? {}
        : { identityForPeriod: input.identityForPeriod }),
      filters: input.filters,
    }),
    freshness:
      input.period.period.key === 'current'
        ? input.ticket.freshness.current
        : (input.ticket.freshness.comparison ?? input.ticket.freshness.current),
  }
}

function createPreparationInput(
  siteId: string,
  window: ReportWindow,
  periodization: PeriodizationByKey | undefined,
): ReportAdmissionPreparationInput {
  const comparison = window.comparison
  return {
    siteId: createSiteId(siteId),
    current: {
      fromDate: createCalendarDate(window.fromDate),
      toDate: createCalendarDate(window.toDate),
    },
    ...(comparison === undefined
      ? {}
      : {
          comparison: {
            fromDate: createCalendarDate(comparison.fromDate),
            toDate: createCalendarDate(comparison.toDate),
          },
        }),
    ...(periodization === undefined ? {} : { periodization }),
  }
}

function createAdmissionWork(
  filters: readonly ReportFilter[] | undefined,
  work: StatefulReportWork,
): ReportWorkDemand {
  return {
    extraMetricCount: work.extraMetricCount,
    dimensionCount: 0,
    filterCount: filters?.length ?? 0,
    distinctCountOperations: work.distinctCountOperations,
    budget: REPORT_FACT_WORK_BUDGETS.stateful,
  }
}

function createIdentityScope(kind: ReportIdentityKind, snapshot: ReportSnapshot): IdentityScope {
  const identifiedSubject = (identifiedUserId: string | null): string | null => {
    if (identifiedUserId === null || !snapshot.activeProfiles.has(identifiedUserId)) return null
    return identifiedUserId
  }
  const subjectOfEvent = (event: ReportSnapshot['events'][number]): string | null =>
    kind === 'visitor' ? event.visitorId : identifiedSubject(event.identifiedUserId)
  const subjectOfSession = (session: ReportSnapshot['sessions'][number]): string | null =>
    kind === 'visitor' ? session.visitorId : identifiedSubject(session.identifiedUserId)
  return {
    kind,
    subjectOfEvent,
    subjectOfSession,
    sessionIsEligible: (session) => subjectOfSession(session) !== null,
  }
}
