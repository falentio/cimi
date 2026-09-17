import type { AuthUser } from '@cimi/auth'
import {
  SCohortArchiveInput,
  SCohortCreateInput,
  SCohortCreateOutput,
  SCohortGetInput,
  SCohortGetOutput,
  SCohortListInput,
  SCohortListOutput,
  SCohortReportInput,
  SCohortReportOutput,
  SCohortUpdateInput,
  SCohortUpdateOutput,
} from '@cimi/contract'
import type { AnalyticsDb, Db } from '@cimi/db'
import {
  assertSiteManagementScope,
  assertSiteScope,
  type SiteScopeGuardDependencies,
} from '@cimi/guard'
import {
  reportingNotFound,
  type LifecycleLock,
  type ReportingAdmissionService,
  type ReportEvaluationPeriod,
  type ResolvedPeriod,
  type InstantMs,
} from '@cimi/kernel'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import { evaluateRetention, type CohortReportPeriod } from './evaluator.ts'
import {
  createReportQueryKernelFromInfrastructure,
  cohortReportWork,
  coverageForDefinitions,
  historicalDefinitionFor,
  type HistoricalDefinition,
  type HistoricalDefinitionPlan,
  type ReportQueryKernel,
  type ReportRun,
} from '../reporting/index.ts'
import type { CohortRepository } from './repository.ts'

export interface CohortServiceDependencies {
  readonly repository: CohortRepository
  readonly scope: SiteScopeGuardDependencies
  readonly admission: ReportingAdmissionService
  readonly lifecycleLock: LifecycleLock
  readonly analytics: AnalyticsDb
  readonly db: Db
  readonly query?: ReportQueryKernel | undefined
  readonly clock?: (() => Date) | undefined
  readonly ids?: { readonly cohortId: () => string } | undefined
}

export class CohortService {
  private readonly clock: () => Date
  private readonly cohortId: () => string
  private readonly query: ReportQueryKernel

  constructor(private readonly deps: CohortServiceDependencies) {
    this.clock = deps.clock ?? (() => new Date())
    this.cohortId = deps.ids?.cohortId ?? (() => generateId('coh'))
    this.query =
      deps.query ??
      createReportQueryKernelFromInfrastructure({
        db: deps.db,
        analytics: deps.analytics,
        admission: deps.admission,
        lifecycleLock: deps.lifecycleLock,
      })
  }

  async list(
    input: InferOutput<typeof SCohortListInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SCohortListOutput>> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    return this.deps.repository.findMany({
      siteId: input.siteId,
      offset: input.offset ?? 0,
      limit: input.limit ?? 20,
    })
  }

  async get(
    input: InferOutput<typeof SCohortGetInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SCohortGetOutput>> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const cohort = await this.deps.repository.findById(input)
    if (cohort === undefined) throw new ORPCError('NOT_FOUND')
    return cohort
  }

  async create(
    input: InferOutput<typeof SCohortCreateInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SCohortCreateOutput>> {
    await this.assertCanManage(input.siteId, user)
    try {
      return await this.deps.repository.insert({ ...input, id: this.cohortId(), now: this.clock() })
    } catch (error) {
      if (isConstraintError(error)) throw new ORPCError('CONFLICT', { status: 409 })
      throw error
    }
  }

  async update(
    input: InferOutput<typeof SCohortUpdateInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SCohortUpdateOutput>> {
    await this.assertCanManage(input.siteId, user)
    return mutationOutput(await this.deps.repository.update({ ...input, now: this.clock() }))
  }

  async archive(
    input: InferOutput<typeof SCohortArchiveInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<void> {
    await this.assertCanManage(input.siteId, user)
    const result = await this.deps.repository.archive({ ...input, now: this.clock() })
    if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
    if (result.status === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
  }

  async getReport(
    input: InferOutput<typeof SCohortReportInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SCohortReportOutput>> {
    const cohort = await this.deps.repository.findById({ cohortId: input.cohortId })
    if (cohort === undefined) throw new ORPCError('NOT_FOUND')
    await assertSiteScope(user, cohort.siteId, this.deps.scope)
    const window = reportWindow(input)
    return this.query.run({
      siteId: cohort.siteId,
      window,
      plan: async (planning) => {
        const initialPreparation = await planning.prepare()
        const anchor = await requireCohortDefinition(
          this.deps.repository,
          cohort,
          initialPreparation.evaluation.current.period,
        )
        const comparisonAnchor =
          initialPreparation.evaluation.comparison === null
            ? null
            : await requireCohortDefinition(
                this.deps.repository,
                cohort,
                initialPreparation.evaluation.comparison.period,
              )
        const preparation = await planning.prepare({
          periodization: {
            current: { kind: anchor.period, maxPeriods: 12 },
            ...(comparisonAnchor === null
              ? {}
              : { comparison: { kind: comparisonAnchor.period, maxPeriods: 12 } }),
          },
        })
        const current = await planCohortOuterPeriod(
          this.deps.repository,
          cohort,
          preparation.evaluation.current,
          anchor,
        )
        let comparison: CohortOuterPlan | null = null
        if (preparation.evaluation.comparison !== null) {
          if (comparisonAnchor === null) throw reportingNotFound('definition-version-missing')
          comparison = await planCohortOuterPeriod(
            this.deps.repository,
            cohort,
            preparation.evaluation.comparison,
            comparisonAnchor,
          )
        }
        const definitions: HistoricalDefinitionPlan<CohortRepository.Cohort> = {
          current: current.anchor,
          comparison: comparison?.anchor ?? null,
          all: [...current.all, ...(comparison?.all ?? [])],
        }
        return {
          preparation,
          coverage: coverageForDefinitions({
            definitions: definitions.all,
            filters: window.filters,
          }),
          work: cohortReportWork(),
          identityKindFor: (evaluation) =>
            historicalDefinitionFor(definitions, evaluation.period.key).identityKind,
          identityKindForPeriod: (evaluation, period) =>
            cohortDefinitionForPeriod(
              evaluation.period.key === 'current' ? current : (comparison ?? undefined),
              period,
            ).identityKind,
          evaluate: (evaluation) => {
            const outer =
              evaluation.period.period.key === 'current' ? current : (comparison ?? undefined)
            if (outer === undefined) throw new Error('Comparison cohort plan is not available')
            return evaluateRetention({
              ...evaluation,
              definition: cohortActions(outer.anchor.definition),
              definitionForPeriod: (period) => {
                return cohortActions(cohortDefinitionForPeriod(outer, period).definition)
              },
            })
          },
        }
      },
      render: (run) => ({
        ...cohortReportPeriod(run.current),
        ...(run.comparison === null ? {} : { comparison: cohortReportPeriod(run.comparison) }),
      }),
    })
  }

  private async assertCanManage(
    siteId: string,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<void> {
    await assertSiteManagementScope(user, siteId, this.deps.scope)
    if (!(await this.deps.scope.siteScope.isActive(siteId))) throw new ORPCError('NOT_FOUND')
  }
}

function mutationOutput(result: CohortRepository.MutationResult): CohortRepository.Cohort {
  if (result.status === 'updated') return result.cohort
  if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
  throw new ORPCError('CONFLICT', { status: 409 })
}

function reportWindow(input: InferOutput<typeof SCohortReportInput>) {
  const { cohortId: _cohortId, ...window } = input
  return window
}

function periodEnd(period: Pick<ResolvedPeriod, 'interval'>): Date {
  return new Date(period.interval.endExclusive - 1)
}

interface CohortOuterPlan {
  readonly anchor: HistoricalDefinition<CohortRepository.Cohort>
  readonly outerPeriod: ResolvedPeriod
  readonly byStart: ReadonlyMap<InstantMs, HistoricalDefinition<CohortRepository.Cohort>>
  readonly all: readonly HistoricalDefinition<CohortRepository.Cohort>[]
}

async function planCohortOuterPeriod(
  repository: CohortRepository,
  cohort: CohortRepository.Cohort,
  outerPeriod: ReportEvaluationPeriod,
  anchorDefinition: CohortRepository.Cohort,
): Promise<CohortOuterPlan> {
  const anchor = historicalCohort(anchorDefinition)
  const periods = outerPeriod.sequence ?? [outerPeriod.period]
  const periodDefinitions = await Promise.all(
    periods
      .filter((period) => !samePeriod(period, outerPeriod.period))
      .map(async (period) => ({
        period,
        definition: historicalCohort(await requireCohortDefinition(repository, cohort, period)),
      })),
  )
  const byStart = new Map<InstantMs, HistoricalDefinition<CohortRepository.Cohort>>()
  byStart.set(outerPeriod.period.interval.start, anchor)
  for (const { period, definition } of periodDefinitions) {
    byStart.set(period.interval.start, definition)
  }
  return {
    anchor,
    outerPeriod: outerPeriod.period,
    byStart,
    all: [anchor, ...periodDefinitions.map(({ definition }) => definition)],
  }
}

function samePeriod(
  left: Pick<ResolvedPeriod, 'interval'>,
  right: Pick<ResolvedPeriod, 'interval'>,
): boolean {
  return (
    left.interval.start === right.interval.start &&
    left.interval.endExclusive === right.interval.endExclusive
  )
}

function cohortDefinitionForPeriod(
  outer: CohortOuterPlan | undefined,
  period: ResolvedPeriod,
): HistoricalDefinition<CohortRepository.Cohort> {
  if (outer === undefined) throw reportingNotFound('definition-version-missing')
  const definition = samePeriod(period, outer.outerPeriod)
    ? outer.anchor
    : outer.byStart.get(period.interval.start)
  if (definition === undefined) throw reportingNotFound('definition-version-missing')
  return definition
}

async function requireCohortDefinition(
  repository: CohortRepository,
  cohort: CohortRepository.Cohort,
  period: ResolvedPeriod,
): Promise<CohortRepository.Cohort> {
  const definition = await repository.findVersionAt({
    siteId: cohort.siteId,
    cohortId: cohort.id,
    at: periodEnd(period),
  })
  if (definition === undefined) throw reportingNotFound('definition-version-missing')
  return definition
}

function historicalCohort(definition: CohortRepository.Cohort) {
  return { definition, identityKind: definition.identityKind } as const
}

function cohortActions(definition: CohortRepository.Cohort) {
  return {
    entryAction: definition.entryAction,
    retentionAction: definition.retentionAction,
  }
}

function cohortReportPeriod(period: ReportRun<readonly CohortReportPeriod[]>['current']) {
  return {
    fromDate: String(period.period.period.dates.fromDate),
    toDate: String(period.period.period.dates.toDate),
    periods: [...period.value],
    projectedAcceptanceSequence: period.freshness.projectedAcceptanceSequence,
    occurrenceTimeCoverageThrough:
      period.freshness.occurrenceTimeCoverageThrough === null
        ? null
        : new Date(period.freshness.occurrenceTimeCoverageThrough).toISOString(),
    status: period.freshness.status,
  }
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique|reserved/i.test(error.message)
}
