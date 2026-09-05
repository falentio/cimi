import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture, createSiteRow } from '../../site/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { RetentionPolicyRepositoryDrizzle } from '../repository.drizzle.ts'

const now = new Date('2026-09-05T14:30:00.000Z')

describe('RetentionPolicyRepositoryDrizzle.commitPolicyChange', () => {
  it('projects distinct Site-local boundaries and preserves an override', async () => {
    using fixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
      createInstallationInsertInput(),
    )
    fixture.db
      .update(schema.TSite)
      .set({ reportingTimezone: 'America/New_York' })
      .where(eq(schema.TSite.id, 'ste_1'))
      .run()
    fixture.db
      .insert(schema.TSite)
      .values(
        createSiteRow({
          id: 'ste_2',
          hostname: 'second.example.com',
          ingestionIdentifier: 'ing_2',
          reportingTimezone: 'Asia/Kathmandu',
        }),
      )
      .run()

    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    await repository.commitPolicyChange({
      target: { scope: 'site', siteId: 'ste_1' },
      policy: { eventMonths: 24, profileMonths: 12, replayMonths: 6 },
      policyId: 'rtn_site_1',
      changedBy: 'user_1',
      now,
    })
    const committed = await repository.commitPolicyChange({
      target: { scope: 'installation' },
      policy: { eventMonths: 6, profileMonths: 3, replayMonths: 1 },
      policyId: 'rtn_2',
      changedBy: 'user_1',
      now,
    })

    expect(committed.resolution.effectivePolicy).toEqual({
      eventMonths: 6,
      profileMonths: 3,
      replayMonths: 1,
    })
    const boundaries = fixture.db
      .select()
      .from(schema.TRetentionEffectiveCutoff)
      .orderBy(schema.TRetentionEffectiveCutoff.siteId)
      .all()
    expect(boundaries).toHaveLength(2)
    expect(boundaries[0]).toMatchObject({
      siteId: 'ste_1',
      policyId: 'rtn_site_1',
      reportingTimezone: 'America/New_York',
      localDay: '2026-09-05',
    })
    expect(boundaries[1]).toMatchObject({
      siteId: 'ste_2',
      policyId: 'rtn_2',
      reportingTimezone: 'Asia/Kathmandu',
      localDay: '2026-09-05',
    })
    expect(boundaries[0]!.eventOccurrenceCutoffAt).not.toEqual(
      boundaries[1]!.eventOccurrenceCutoffAt,
    )
    expect(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', dateStyle: 'short' }).format(
        boundaries[0]!.eventOccurrenceCutoffAt,
      ),
    ).toBe('2024-09-05')
    expect(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', dateStyle: 'short' }).format(
        boundaries[1]!.eventOccurrenceCutoffAt,
      ),
    ).toBe('2026-03-05')

    const sitePolicy = fixture.db
      .select({
        id: schema.TRetentionPolicy.id,
        changedBy: schema.TRetentionPolicy.changedBy,
        status: schema.TRetentionPolicy.status,
      })
      .from(schema.TRetentionPolicy)
      .where(
        and(
          eq(schema.TRetentionPolicy.id, 'rtn_site_1'),
          eq(schema.TRetentionPolicy.status, 'active'),
        ),
      )
      .all()[0]
    expect(sitePolicy).toEqual({ id: 'rtn_site_1', changedBy: 'user_1', status: 'active' })
  })

  it('creates an idempotent retention redaction overlay for expired profiles', async () => {
    using fixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
      createInstallationInsertInput(),
    )
    fixture.db
      .insert(schema.TIdentityProfile)
      .values({
        profileId: 'profile_1',
        siteId: 'ste_1',
        identifiedUserId: 'user_1',
        status: 'active',
        profileEpoch: 1,
        traits: null,
        firstSeenAt: new Date('2025-01-01T00:00:00.000Z'),
        lastSeenAt: new Date('2025-01-01T00:00:00.000Z'),
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      })
      .run()
    fixture.db
      .insert(schema.TIdentityProfileEpoch)
      .values({
        profileId: 'profile_1',
        siteId: 'ste_1',
        identifiedUserId: 'user_1',
        epoch: 1,
        status: 'active',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: null,
        redactedAt: null,
      })
      .run()

    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    await repository.commitPolicyChange({
      target: { scope: 'installation' },
      policy: { eventMonths: 6, profileMonths: 3, replayMonths: null },
      policyId: 'rtn_2',
      changedBy: 'user_1',
      now,
    })
    await repository.commitPolicyChange({
      target: { scope: 'installation' },
      policy: { eventMonths: 6, profileMonths: 3, replayMonths: null },
      policyId: 'rtn_3',
      changedBy: 'user_1',
      now: new Date(now.getTime() + 1),
    })

    expect(
      fixture.db
        .select({ status: schema.TIdentityProfile.status })
        .from(schema.TIdentityProfile)
        .all(),
    ).toEqual([{ status: 'deletion-requested' }])
    expect(
      fixture.db
        .select({
          reason: schema.TIdentityRedaction.reason,
          status: schema.TIdentityRedaction.status,
          derivedCleanupStatus: schema.TIdentityRedaction.derivedCleanupStatus,
          backupCleanupStatus: schema.TIdentityRedaction.backupCleanupStatus,
        })
        .from(schema.TIdentityRedaction)
        .all(),
    ).toEqual([
      {
        reason: 'retention',
        status: 'requested',
        derivedCleanupStatus: 'pending',
        backupCleanupStatus: 'pending',
      },
    ])
  })

  it('queues cleanup when the site-local retention horizon advances', async () => {
    using fixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
      createInstallationInsertInput(),
    )
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })

    await repository.commitPolicyChange({
      target: { scope: 'installation' },
      policy: { eventMonths: 6, profileMonths: 3, replayMonths: 1 },
      policyId: 'rtn_2',
      changedBy: 'user_1',
      now,
    })
    fixture.db
      .update(schema.TRetentionCleanupRun)
      .set({ status: 'succeeded', completedAt: now })
      .run()

    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    await repository.refreshDueBoundaries(nextDay)

    const runs = fixture.db
      .select({
        status: schema.TRetentionCleanupRun.status,
        createdAt: schema.TRetentionCleanupRun.createdAt,
      })
      .from(schema.TRetentionCleanupRun)
      .all()
    expect(runs).toHaveLength(4)
    expect(runs.filter((run) => run.status === 'queued')).toHaveLength(2)
  })
})
