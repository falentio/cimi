import type { AuthUser } from '@cimi/auth'
import {
  SFunnelArchiveInput,
  SFunnelCreateInput,
  SFunnelCreateOutput,
  SFunnelGetInput,
  SFunnelGetOutput,
  SFunnelListInput,
  SFunnelListOutput,
  SFunnelReportInput,
  SFunnelReportOutput,
  SFunnelUpdateInput,
  SFunnelUpdateOutput,
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
import { evaluateFunnel, type FunnelReportStep } from './evaluator.ts'
import {
  createReportQueryKernelFromInfrastructure,
  funnelReportWork,
  type ReportQueryKernel,
  type ReportRun,
} from '../reporting/index.ts'
import type { FunnelRepository } from './repository.ts'

export interface FunnelServiceDependencies {
  readonly repository: FunnelRepository
  readonly scope: SiteScopeGuardDependencies
  readonly admission: ReportingAdmissionService
  readonly analytics: AnalyticsDb
  readonly db: Db
  readonly query?: ReportQueryKernel | undefined
  readonly clock?: (() => Date) | undefined
  readonly ids?: { readonly funnelId: () => string } | undefined
}

export class FunnelService {
  private readonly clock: () => Date
  private readonly funnelId: () => string
  private readonly query: ReportQueryKernel

  constructor(private readonly deps: FunnelServiceDependencies) {
    this.clock = deps.clock ?? (() => new Date())
    this.funnelId = deps.ids?.funnelId ?? (() => generateId('fun'))
    this.query =
      deps.query ??
      createReportQueryKernelFromInfrastructure({
        db: deps.db,
        analytics: deps.analytics,
        admission: deps.admission,
      })
  }

  async list(
    input: InferOutput<typeof SFunnelListInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SFunnelListOutput>> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    return this.deps.repository.findMany({
      siteId: input.siteId,
      offset: input.offset ?? 0,
      limit: input.limit ?? 20,
    })
  }

  async get(
    input: InferOutput<typeof SFunnelGetInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SFunnelGetOutput>> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const funnel = await this.deps.repository.findById(input)
    if (funnel === undefined) throw new ORPCError('NOT_FOUND')
    return funnel
  }

  async create(
    input: InferOutput<typeof SFunnelCreateInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SFunnelCreateOutput>> {
    await this.assertCanManage(input.siteId, user)
    try {
      return await this.deps.repository.insert({ ...input, id: this.funnelId(), now: this.clock() })
    } catch (error) {
      if (isConstraintError(error)) throw new ORPCError('CONFLICT', { status: 409 })
      throw error
    }
  }

  async update(
    input: InferOutput<typeof SFunnelUpdateInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SFunnelUpdateOutput>> {
    await this.assertCanManage(input.siteId, user)
    return mutationOutput(await this.deps.repository.update({ ...input, now: this.clock() }))
  }

  async archive(
    input: InferOutput<typeof SFunnelArchiveInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<void> {
    await this.assertCanManage(input.siteId, user)
    const result = await this.deps.repository.archive({ ...input, now: this.clock() })
    if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
    if (result.status === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
  }

  async getReport(
    input: InferOutput<typeof SFunnelReportInput>,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<InferOutput<typeof SFunnelReportOutput>> {
    const funnel = await this.deps.repository.findById({ funnelId: input.funnelId })
    if (funnel === undefined) throw new ORPCError('NOT_FOUND')
    await assertSiteScope(user, funnel.siteId, this.deps.scope)
    const run = await this.query.run({
      siteId: funnel.siteId,
      window: reportWindow(input),
      identityKind: funnel.identityKind,
      work: funnelReportWork(funnel.steps.length),
      evaluate: async (evaluation) => {
        const definition =
          (await this.deps.repository.findVersionAt({
            siteId: funnel.siteId,
            funnelId: funnel.id,
            at: periodEnd(evaluation.period.period),
          })) ?? funnel
        return evaluateFunnel({
          ...evaluation,
          definition: { steps: definition.steps },
        })
      },
    })
    return {
      ...funnelReportPeriod(run.current),
      ...(run.comparison === null ? {} : { comparison: funnelReportPeriod(run.comparison) }),
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

function mutationOutput(result: FunnelRepository.MutationResult): FunnelRepository.Funnel {
  if (result.status === 'updated') return result.funnel
  if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
  throw new ORPCError('CONFLICT', { status: 409 })
}

function reportWindow(input: InferOutput<typeof SFunnelReportInput>) {
  const { funnelId: _funnelId, ...window } = input
  return window
}

function periodEnd(period: { readonly interval: { readonly endExclusive: number } }): Date {
  return new Date(period.interval.endExclusive - 1)
}

function funnelReportPeriod(period: ReportRun<readonly FunnelReportStep[]>['current']) {
  return {
    fromDate: String(period.period.period.dates.fromDate),
    toDate: String(period.period.period.dates.toDate),
    steps: period.value.map((step, index) => ({ index, ...step })),
    projectedAcceptanceSequence: period.freshness.projectedAcceptanceSequence,
    occurrenceTimeCoverageThrough:
      period.freshness.occurrenceTimeCoverageThrough === null
        ? null
        : new Date(period.freshness.occurrenceTimeCoverageThrough).toISOString(),
    status: period.freshness.status,
  } as const
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique|reserved/i.test(error.message)
}
