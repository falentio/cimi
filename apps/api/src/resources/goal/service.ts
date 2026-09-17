import type { AuthUser } from '@cimi/auth'
import {
  SGoalArchiveInput,
  SGoalCreateInput,
  SGoalCreateOutput,
  SGoalGetInput,
  SGoalGetOutput,
  SGoalListInput,
  SGoalListOutput,
  SGoalReportInput,
  SGoalReportOutput,
  SGoalUpdateInput,
  SGoalUpdateOutput,
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
import { evaluateGoal, type GoalReportCounts } from './evaluator.ts'
import {
  createReportQueryKernelFromInfrastructure,
  goalReportWork,
  type ReportQueryKernel,
} from '../reporting/index.ts'
import type { ReportRun } from '../reporting/index.ts'
import type { GoalRepository } from './repository.ts'

export interface GoalServiceDependencies {
  readonly repository: GoalRepository
  readonly scope: SiteScopeGuardDependencies
  readonly admission: ReportingAdmissionService
  readonly analytics: AnalyticsDb
  readonly db: Db
  readonly query?: ReportQueryKernel | undefined
  readonly clock?: (() => Date) | undefined
  readonly ids?: { readonly goalId: () => string } | undefined
}

export class GoalService {
  private readonly clock: () => Date
  private readonly goalId: () => string
  private readonly query: ReportQueryKernel

  constructor(private readonly deps: GoalServiceDependencies) {
    this.clock = deps.clock ?? (() => new Date())
    this.goalId = deps.ids?.goalId ?? (() => generateId('gol'))
    this.query =
      deps.query ??
      createReportQueryKernelFromInfrastructure({
        db: deps.db,
        analytics: deps.analytics,
        admission: deps.admission,
      })
  }

  async list(
    input: InferOutput<typeof SGoalListInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SGoalListOutput>> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    return this.deps.repository.findMany({
      siteId: input.siteId,
      offset: input.offset ?? 0,
      limit: input.limit ?? 20,
    })
  }

  async get(
    input: InferOutput<typeof SGoalGetInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SGoalGetOutput>> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const goal = await this.deps.repository.findById(input)
    if (goal === undefined) throw new ORPCError('NOT_FOUND')
    return goal
  }

  async create(
    input: InferOutput<typeof SGoalCreateInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SGoalCreateOutput>> {
    await this.assertCanManage(input.siteId, user)
    try {
      return await this.deps.repository.insert({ ...input, id: this.goalId(), now: this.clock() })
    } catch (error) {
      if (isConstraintError(error)) throw new ORPCError('CONFLICT', { status: 409 })
      throw error
    }
  }

  async update(
    input: InferOutput<typeof SGoalUpdateInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SGoalUpdateOutput>> {
    await this.assertCanManage(input.siteId, user)
    const result = await this.deps.repository.update({ ...input, now: this.clock() })
    return mutationOutput(result)
  }

  async archive(
    input: InferOutput<typeof SGoalArchiveInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<void> {
    await this.assertCanManage(input.siteId, user)
    const result = await this.deps.repository.archive({ ...input, now: this.clock() })
    if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
    if (result.status === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
  }

  async getReport(
    input: InferOutput<typeof SGoalReportInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SGoalReportOutput>> {
    const goal = await this.deps.repository.findById({ goalId: input.goalId })
    if (goal === undefined) throw new ORPCError('NOT_FOUND')
    await assertSiteScope(user, goal.siteId, this.deps.scope)
    const run = await this.query.run({
      siteId: goal.siteId,
      window: reportWindow(input),
      identityKind: goal.identityKind,
      work: goalReportWork(),
      evaluate: async (evaluation) => {
        const definition =
          (await this.deps.repository.findVersionAt({
            siteId: goal.siteId,
            goalId: goal.id,
            at: periodEnd(evaluation.period.period),
          })) ?? goal
        return evaluateGoal({
          ...evaluation,
          definition: {
            action: definition.action,
            propertyFilters: definition.propertyFilters,
          },
        })
      },
    })
    const current = goalReportPeriod(run.current)
    return {
      ...current,
      ...(run.comparison === null ? {} : { comparison: goalReportPeriod(run.comparison) }),
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

function mutationOutput(result: GoalRepository.MutationResult): GoalRepository.Goal {
  if (result.status === 'updated') return result.goal
  if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
  throw new ORPCError('CONFLICT', { status: 409 })
}

function reportWindow(input: InferOutput<typeof SGoalReportInput>) {
  const { goalId: _goalId, ...window } = input
  return window
}

function periodEnd(period: { readonly interval: { readonly endExclusive: number } }): Date {
  return new Date(period.interval.endExclusive - 1)
}

function goalReportPeriod(period: ReportRun<GoalReportCounts>['current']) {
  return {
    fromDate: String(period.period.period.dates.fromDate),
    toDate: String(period.period.period.dates.toDate),
    conversions: period.value.conversions,
    eligibleSessions: period.value.eligibleSessions,
    conversionRate: ratio(period.value.conversions, period.value.eligibleSessions),
    ...freshnessOutput(period.freshness),
  }
}

function freshnessOutput(freshness: {
  readonly projectedAcceptanceSequence: number
  readonly occurrenceTimeCoverageThrough: number | null
  readonly status: 'current' | 'stale'
}) {
  return {
    projectedAcceptanceSequence: freshness.projectedAcceptanceSequence,
    occurrenceTimeCoverageThrough:
      freshness.occurrenceTimeCoverageThrough === null
        ? null
        : new Date(freshness.occurrenceTimeCoverageThrough).toISOString(),
    status: freshness.status,
  } as const
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique|reserved/i.test(error.message)
}
