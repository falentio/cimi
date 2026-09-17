import { asc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { CohortRepositoryDrizzle } from '../../cohort-retention/repository.drizzle.ts'
import { FunnelRepositoryDrizzle } from '../../funnel/repository.drizzle.ts'
import { GoalRepositoryDrizzle } from '../../goal/repository.drizzle.ts'

const now = new Date('2026-09-05T00:00:00.000Z')

describe('versioned reporting definitions', () => {
  it('commits Goal versions before advancing the current pointer and preserves archive state', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new GoalRepositoryDrizzle({ db: fixture.db })
    const action = { kind: 'custom_event' as const, name: 'signup' }

    await expect(
      repository.insert({
        id: 'gol_1',
        siteId: 'ste_1',
        name: 'Signups',
        action,
        identityKind: 'visitor',
        now,
      }),
    ).resolves.toMatchObject({ id: 'gol_1', status: 'active' })

    const updated = await repository.update({
      siteId: 'ste_1',
      goalId: 'gol_1',
      name: 'Completed signups',
      action,
      identityKind: 'identified_user',
      now: new Date(now.getTime() + 1),
    })
    expect(updated).toMatchObject({ status: 'updated', goal: { identityKind: 'identified_user' } })
    expect(
      fixture.db
        .select({ version: schema.TGoalVersion.version })
        .from(schema.TGoalVersion)
        .where(eq(schema.TGoalVersion.goalId, 'gol_1'))
        .orderBy(asc(schema.TGoalVersion.version))
        .all(),
    ).toEqual([{ version: 1 }, { version: 2 }])
    await expect(
      repository.findVersionAt({ siteId: 'ste_1', goalId: 'gol_1', at: now }),
    ).resolves.toMatchObject({ name: 'Signups', identityKind: 'visitor' })
    await expect(
      repository.findVersionAt({
        siteId: 'ste_1',
        goalId: 'gol_1',
        at: new Date(now.getTime() + 1),
      }),
    ).resolves.toMatchObject({ name: 'Completed signups', identityKind: 'identified_user' })

    await expect(
      repository.archive({ siteId: 'ste_1', goalId: 'gol_1', now: new Date(now.getTime() + 2) }),
    ).resolves.toMatchObject({ status: 'updated', goal: { status: 'archived' } })
    await expect(
      repository.archive({ siteId: 'ste_1', goalId: 'gol_1', now: new Date(now.getTime() + 3) }),
    ).resolves.toEqual({ status: 'conflict' })
  })

  it('paginates coherent Goal definitions in createdAt plus ID order', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new GoalRepositoryDrizzle({ db: fixture.db })
    const action = { kind: 'page_view' as const }
    for (const id of ['gol_b', 'gol_a']) {
      await repository.insert({
        id,
        siteId: 'ste_1',
        name: id,
        action,
        identityKind: 'visitor',
        now,
      })
    }

    await expect(
      repository.findMany({ siteId: 'ste_1', offset: 0, limit: 1 }),
    ).resolves.toMatchObject({
      items: [{ id: 'gol_a' }],
      nextOffset: 1,
      hasMore: true,
      totalCount: 2,
    })
  })

  it('does not return a Funnel or Cohort whose current version is missing', async () => {
    using fixture = createSiteDrizzleFixture()
    const funnelRepository = new FunnelRepositoryDrizzle({ db: fixture.db })
    const cohortRepository = new CohortRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .insert(schema.TFunnel)
      .values({
        id: 'fun_1',
        siteId: 'ste_1',
        name: 'Signup funnel',
        identityKind: 'visitor',
        status: 'active',
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    fixture.db
      .insert(schema.TCohort)
      .values({
        id: 'coh_1',
        siteId: 'ste_1',
        name: 'Returning visitors',
        identityKind: 'visitor',
        period: 'day',
        status: 'active',
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    await expect(funnelRepository.findById({ funnelId: 'fun_1' })).resolves.toBeUndefined()
    await expect(cohortRepository.findById({ cohortId: 'coh_1' })).resolves.toBeUndefined()
  })

  it('round-trips Funnel and Cohort definitions without undefined JSON members', async () => {
    using fixture = createSiteDrizzleFixture()
    const funnelRepository = new FunnelRepositoryDrizzle({ db: fixture.db })
    const cohortRepository = new CohortRepositoryDrizzle({ db: fixture.db })
    const steps = [{ kind: 'page_view' as const }, { kind: 'outbound' as const, name: undefined }]
    const entryAction = { kind: 'page_view' as const }
    const retentionAction = { kind: 'custom_event' as const, name: 'return' }

    await funnelRepository.insert({
      id: 'fun_1',
      siteId: 'ste_1',
      name: 'Signup funnel',
      steps,
      identityKind: 'visitor',
      now,
    })
    await cohortRepository.insert({
      id: 'coh_1',
      siteId: 'ste_1',
      name: 'Returning visitors',
      entryAction,
      retentionAction,
      identityKind: 'visitor',
      period: 'day',
      now,
    })

    await expect(
      funnelRepository.findById({ siteId: 'ste_1', funnelId: 'fun_1' }),
    ).resolves.toMatchObject({
      steps: [{ kind: 'page_view' }, { kind: 'outbound' }],
    })
    await expect(
      cohortRepository.findById({ siteId: 'ste_1', cohortId: 'coh_1' }),
    ).resolves.toMatchObject({
      retentionAction,
    })
  })

  it('scopes definitions to the live Site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new GoalRepositoryDrizzle({ db: fixture.db })
    await repository.insert({
      id: 'gol_1',
      siteId: 'ste_1',
      name: 'Signups',
      action: { kind: 'page_view' },
      identityKind: 'visitor',
      now,
    })
    fixture.db
      .insert(schema.TSiteTombstone)
      .values({
        siteId: 'ste_1',
        organizationId: 'org_1',
        hostname: 'example.com',
        purgeOperationId: 'sop_1',
        purgedAt: now,
        createdAt: now,
      })
      .run()

    await expect(repository.findById({ siteId: 'ste_1', goalId: 'gol_1' })).resolves.toBeUndefined()
    await expect(
      repository.findMany({ siteId: 'ste_1', offset: 0, limit: 20 }),
    ).resolves.toMatchObject({
      items: [],
      totalCount: 0,
    })
  })
})
