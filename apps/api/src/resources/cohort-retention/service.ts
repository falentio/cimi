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
import type { ReportingAdmissionService } from '@cimi/kernel'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import { evaluateRetention, type CohortReportPeriod } from './evaluator.ts'
import {
  createReportQueryKernelFromInfrastructure,
  cohortReportWork,
  type ReportQueryKernel,
  type ReportRun,
} from '../reporting/index.ts'
import type { CohortRepository } from './repository.ts'

export interface CohortServiceDependencies {
  readonly repository: CohortRepository
  readonly scope: SiteScopeGuardDependencies
  readonly admission: ReportingAdmissionService
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
    const run = await this.query.run({
      siteId: cohort.siteId,
      window: reportWindow(input),
      identityKind: cohort.identityKind,
      periodization: { kind: cohort.period, maxPeriods: 12 },
      work: cohortReportWork(),
      evaluate: async (evaluation) => {
        const periods = evaluation.period.sequence ?? [evaluation.period.period]
        const definitions = await Promise.all(
          periods.map((period) =>
            this.deps.repository.findVersionAt({
              siteId: cohort.siteId,
              cohortId: cohort.id,
              at: periodEnd(period),
            }),
          ),
        )
        const resolvedDefinitions = definitions.map((definition) => definition ?? cohort)
        const firstDefinition = resolvedDefinitions[0]
        if (firstDefinition === undefined) throw new ORPCError('NOT_FOUND')
        const definitionsByStart = new Map(
          periods.map((period, index) => [period.interval.start, resolvedDefinitions[index]]),
        )
        return evaluateRetention({
          ...evaluation,
          definition: {
            entryAction: firstDefinition.entryAction,
            retentionAction: firstDefinition.retentionAction,
          },
          definitionForPeriod: (period) => {
            const definition = definitionsByStart.get(period.interval.start)
            return definition === undefined
              ? firstDefinition
              : {
                  entryAction: definition.entryAction,
                  retentionAction: definition.retentionAction,
                }
          },
        })
      },
    })
    return {
      ...cohortReportPeriod(run.current),
      ...(run.comparison === null ? {} : { comparison: cohortReportPeriod(run.comparison) }),
    }
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

function periodEnd(period: { readonly interval: { readonly endExclusive: number } }): Date {
  return new Date(period.interval.endExclusive - 1)
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
