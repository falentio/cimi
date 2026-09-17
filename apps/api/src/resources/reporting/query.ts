import { REPORT_FACT_WORK_BUDGETS, schema as contractSchema } from '@cimi/contract'
import {
  ReportingAdmissionService,
  createCalendarDate,
  createSiteId,
  type FreshnessEvidence,
  type Periodization,
  type ReportAdmissionTicket,
  type ReportEvaluationPeriod,
} from '@cimi/kernel'
import type { InferOutput } from 'valibot'
import type { EvaluationPeriod, IdentityScope, ReportFilter, ReportSnapshot } from './model.ts'
import type { ReportEvaluationInput } from './evaluation.ts'
import { toOrpcReportingError } from './errors.ts'

export type ReportWindow = InferOutput<typeof contractSchema.SReportFieldsSchema>

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
  run<T>(input: {
    readonly siteId: string
    readonly window: ReportWindow
    readonly identityKind: 'visitor' | 'identified_user'
    readonly work: StatefulReportWork
    readonly periodization?: Periodization
    readonly evaluate: (input: ReportEvaluationInput) => T | PromiseLike<T>
  }): Promise<ReportRun<T>>
}

interface ReportQueryInput<T> {
  readonly siteId: string
  readonly window: ReportWindow
  readonly identityKind: 'visitor' | 'identified_user'
  readonly work: StatefulReportWork
  readonly periodization?: Periodization
  readonly evaluate: (input: ReportEvaluationInput) => T | PromiseLike<T>
}

export interface ReportQueryKernelDependencies {
  readonly admission: ReportingAdmissionService
  readonly data: ReportDataPort
}

export function createReportQueryKernel(
  dependencies: ReportQueryKernelDependencies,
): ReportQueryKernel {
  return {
    run: async <T>(input: ReportQueryInput<T>): Promise<ReportRun<T>> => {
      const filters = input.window.filters
      let ticket: ReportAdmissionTicket
      try {
        ticket = await dependencies.admission.admit({
          siteId: createSiteId(input.siteId),
          current: {
            fromDate: createCalendarDate(input.window.fromDate),
            toDate: createCalendarDate(input.window.toDate),
          },
          ...(input.window.comparison === undefined
            ? {}
            : {
                comparison: {
                  fromDate: createCalendarDate(input.window.comparison.fromDate),
                  toDate: createCalendarDate(input.window.comparison.toDate),
                },
              }),
          ...(input.periodization === undefined ? {} : { periodization: input.periodization }),
          coverage: [
            'event-occurrence',
            ...(input.identityKind === 'identified_user' ||
            filters?.some((filter) => filter.scope === 'profile')
              ? (['profile-activity'] as const)
              : []),
          ],
          work: {
            extraMetricCount: input.work.extraMetricCount,
            dimensionCount: 0,
            filterCount: filters?.length ?? 0,
            distinctCountOperations: input.work.distinctCountOperations,
            budget: REPORT_FACT_WORK_BUDGETS.stateful,
          },
        })
      } catch (error) {
        throw toOrpcReportingError(error)
      }
      let snapshot: ReportSnapshot
      try {
        snapshot = await dependencies.data.read({
          siteId: input.siteId,
          from: ticket.evaluation.interval.start,
          toExclusive: ticket.evaluation.interval.endExclusive,
        })
      } catch (error) {
        throw toOrpcReportingError(error)
      }
      const identity = createIdentityScope(input.identityKind, snapshot)
      const current = await evaluatePeriod({
        ticket,
        snapshot,
        identity,
        filters,
        evaluate: input.evaluate,
        period: ticket.evaluation.current,
      })
      const comparison =
        ticket.evaluation.comparison === null
          ? null
          : await evaluatePeriod({
              ticket,
              snapshot,
              identity,
              filters,
              evaluate: input.evaluate,
              period: ticket.evaluation.comparison,
            })
      return { current, comparison }
    },
  }
}

async function evaluatePeriod<T>(input: {
  readonly ticket: ReportAdmissionTicket
  readonly snapshot: ReportSnapshot
  readonly identity: IdentityScope
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
      filters: input.filters,
    }),
    freshness:
      input.period.period.key === 'current'
        ? input.ticket.freshness.current
        : (input.ticket.freshness.comparison ?? input.ticket.freshness.current),
  }
}

function createIdentityScope(
  kind: 'visitor' | 'identified_user',
  snapshot: ReportSnapshot,
): IdentityScope {
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
