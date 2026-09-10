import { describe, expect, it } from 'vitest'
import { asc, eq, isNull } from 'drizzle-orm'
import { SProfileTraits } from '@cimi/contract'
import { schema } from '@cimi/db'
import { safeParse } from 'valibot'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../repository.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'

const firstSeenAt = new Date('2026-09-10T06:00:00.000Z')
const later = new Date('2026-09-10T06:05:00.000Z')

describe('IdentityProfileRepositoryDrizzle', () => {
  it('updates traits by removing null markers and preserves the current Alias', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => 'ipr_1',
        identityLinkId: () => 'ilk_1',
        identityRedactionId: () => 'ird_1',
      },
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: { plan: 'pro', team: 'core' },
      anonymousIdentityId: 'ano_1',
      now: firstSeenAt,
    })

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { plan: null, team: 'platform' },
        anonymousIdentityId: 'ano_1',
        now: later,
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({
      traits: { team: 'platform' },
      aliases: ['ano_1'],
      profileEpoch: 1,
      lastSeenAt: later.toISOString(),
    })
    expect(
      fixture.db
        .select({ profileId: schema.TIdentityLink.profileId })
        .from(schema.TIdentityLink)
        .where(isNull(schema.TIdentityLink.unlinkedAt))
        .all(),
    ).toHaveLength(1)
  })

  it('anchors an alias at the current session receipt boundary', async () => {
    using fixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
      createInstallationInsertInput(),
    )
    const policyRevision = fixture.db.$client
      .prepare('SELECT id FROM collection_policy_revision LIMIT 1')
      .get() as { readonly id: string }
    const events = [
      {
        eventId: 'event_old',
        occurrenceTime: new Date('2026-09-10T05:00:00.000Z'),
        receiptTime: new Date('2026-09-10T05:00:00.000Z'),
        analyticsSessionId: 'session_old',
        replaySequence: 1,
      },
      {
        eventId: 'event_current_late',
        occurrenceTime: new Date('2026-09-10T04:00:00.000Z'),
        receiptTime: new Date('2026-09-10T06:00:00.000Z'),
        analyticsSessionId: 'session_current',
        replaySequence: 2,
      },
      {
        eventId: 'event_current',
        occurrenceTime: new Date('2026-09-10T04:30:00.000Z'),
        receiptTime: new Date('2026-09-10T06:05:00.000Z'),
        analyticsSessionId: 'session_current',
        replaySequence: 3,
      },
    ]
    for (const event of events) {
      fixture.db
        .insert(schema.TAcceptedEvent)
        .values({
          siteId: 'ste_1',
          eventId: event.eventId,
          eventKind: 'custom_event',
          anonymousIdentityId: 'ano_1',
          pageViewId: null,
          occurrenceTime: event.occurrenceTime,
          receiptTime: event.receiptTime,
          late: false,
          visitorId: 'visitor_1',
          identifiedUserId: null,
          analyticsSessionId: event.analyticsSessionId,
          botPolicyOutcome: 'included',
          policyRevisionId: policyRevision.id,
          replaySequence: event.replaySequence,
          payloadFingerprint: `fingerprint_${event.eventId}`,
          projectionState: 'projected',
          projectedAt: event.receiptTime,
          createdAt: event.receiptTime,
        })
        .run()
    }
    const repository = new IdentityProfileRepositoryDrizzle({ db: fixture.db })

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: undefined,
        anonymousIdentityId: 'ano_1',
        now: new Date('2026-09-10T06:10:00.000Z'),
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    expect(
      fixture.db
        .select({ effectiveFrom: schema.TIdentityLink.effectiveFrom })
        .from(schema.TIdentityLink)
        .all(),
    ).toEqual([{ effectiveFrom: new Date('2026-09-10T06:00:00.000Z') }])
  })

  it('does not relink an alias before its prior redaction boundary', async () => {
    using fixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
      createInstallationInsertInput(),
    )
    const policyRevision = fixture.db.$client
      .prepare('SELECT id FROM collection_policy_revision LIMIT 1')
      .get() as { readonly id: string }
    const redactedAt = new Date('2026-09-10T06:00:00.000Z')
    fixture.db
      .insert(schema.TIdentityProfile)
      .values({
        profileId: 'ipr_1',
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        status: 'deleted',
        profileEpoch: 1,
        traits: null,
        firstSeenAt: new Date('2026-09-10T04:00:00.000Z'),
        lastSeenAt: new Date('2026-09-10T05:00:00.000Z'),
        createdAt: new Date('2026-09-10T04:00:00.000Z'),
        updatedAt: redactedAt,
      })
      .run()
    fixture.db
      .insert(schema.TIdentityProfileEpoch)
      .values({
        profileId: 'ipr_1',
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        epoch: 1,
        status: 'redacted',
        startedAt: new Date('2026-09-10T04:00:00.000Z'),
        endedAt: redactedAt,
        redactedAt,
      })
      .run()
    fixture.db
      .insert(schema.TIdentityRedaction)
      .values({
        id: 'ird_1',
        siteId: 'ste_1',
        profileId: 'ipr_1',
        identifiedUserId: 'app_user_1',
        profileEpoch: 1,
        reason: 'explicit',
        status: 'applied',
        requestedAt: redactedAt,
        appliedAt: redactedAt,
        derivedCleanupStatus: 'complete',
        backupCleanupStatus: 'complete',
        derivedCleanupUpdatedAt: redactedAt,
        backupCleanupUpdatedAt: redactedAt,
        createdAt: redactedAt,
        updatedAt: redactedAt,
      })
      .run()
    fixture.db
      .insert(schema.TAcceptedEvent)
      .values({
        siteId: 'ste_1',
        eventId: 'event_before_redaction',
        eventKind: 'custom_event',
        anonymousIdentityId: 'ano_1',
        pageViewId: null,
        occurrenceTime: new Date('2026-09-10T05:00:00.000Z'),
        receiptTime: new Date('2026-09-10T05:00:00.000Z'),
        late: false,
        visitorId: 'visitor_1',
        identifiedUserId: null,
        analyticsSessionId: 'session_current',
        botPolicyOutcome: 'included',
        policyRevisionId: policyRevision.id,
        replaySequence: 1,
        payloadFingerprint: 'fingerprint_1',
        projectionState: 'projected',
        projectedAt: new Date('2026-09-10T05:00:00.000Z'),
        createdAt: new Date('2026-09-10T05:00:00.000Z'),
      })
      .run()
    const repository = new IdentityProfileRepositoryDrizzle({ db: fixture.db })

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: undefined,
        anonymousIdentityId: 'ano_1',
        now: new Date('2026-09-10T06:10:00.000Z'),
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    expect(
      fixture.db
        .select({ effectiveFrom: schema.TIdentityLink.effectiveFrom })
        .from(schema.TIdentityLink)
        .all(),
    ).toEqual([{ effectiveFrom: redactedAt }])
  })

  it('rejects an update that would exceed the Trait key bound', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({ db: fixture.db })
    const traits = Object.fromEntries(
      Array.from({ length: 64 }, (_, index) => [`trait-${index}`, 'value']),
    )
    expect(safeParse(SProfileTraits, { ...traits, extra: 'value' }).success).toBe(false)

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits,
        anonymousIdentityId: undefined,
        now: firstSeenAt,
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({ traits })
    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { extra: 'value' },
        anonymousIdentityId: undefined,
        now: later,
      }),
    ).resolves.toEqual({ kind: 'invalid' })
  })

  it('moves an Alias between profiles without leaving two current links', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: (() => {
          let next = 0
          return () => `ipr_${++next}`
        })(),
        identityLinkId: (() => {
          let next = 0
          return () => `ilk_${++next}`
        })(),
        identityRedactionId: () => 'ird_1',
      },
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: undefined,
      anonymousIdentityId: 'ano_1',
      now: firstSeenAt,
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_2',
      traits: undefined,
      anonymousIdentityId: 'ano_1',
      now: later,
    })

    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({ aliases: [] })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_2' }),
    ).resolves.toMatchObject({ aliases: ['ano_1'] })
    expect(
      fixture.db
        .select({
          profileId: schema.TIdentityLink.profileId,
          effectiveFrom: schema.TIdentityLink.effectiveFrom,
          unlinkedAt: schema.TIdentityLink.unlinkedAt,
        })
        .from(schema.TIdentityLink)
        .orderBy(asc(schema.TIdentityLink.id))
        .all(),
    ).toEqual([
      { profileId: 'ipr_1', effectiveFrom: firstSeenAt, unlinkedAt: later },
      { profileId: 'ipr_2', effectiveFrom: later, unlinkedAt: null },
    ])
  })

  it('lists active and inactive profiles by stable creation order', async () => {
    using fixture = createSiteDrizzleFixture()
    let nextId = 0
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => `ipr_${++nextId}`,
        identityLinkId: () => `ilk_${++nextId}`,
        identityRedactionId: () => `ird_${++nextId}`,
      },
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: undefined,
      anonymousIdentityId: undefined,
      now: firstSeenAt,
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_2',
      traits: undefined,
      anonymousIdentityId: undefined,
      now: later,
    })
    await repository.requestDeletion({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      now: later,
    })

    await expect(repository.list({ siteId: 'ste_1', offset: 0, limit: 1 })).resolves.toMatchObject({
      items: [{ status: 'deletion-requested' }],
      nextOffset: 1,
      hasMore: true,
      totalCount: 2,
    })
  })

  it('creates an active Profile Epoch and links the current Alias', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => 'ipr_1',
        identityLinkId: () => 'ilk_1',
        identityRedactionId: () => 'ird_1',
      },
    })

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { plan: 'pro' },
        anonymousIdentityId: 'ano_1',
        now: firstSeenAt,
      }),
    ).resolves.toEqual({
      kind: 'accepted',
      output: {
        identifiedUserId: 'app_user_1',
        status: 'active',
        updatedAt: firstSeenAt.toISOString(),
      },
    })

    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toEqual({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: { plan: 'pro' },
      aliases: ['ano_1'],
      profileEpoch: 1,
      identityHistory: [
        {
          epoch: 1,
          status: 'active',
          startedAt: firstSeenAt.toISOString(),
          endedAt: null,
        },
      ],
      status: 'active',
      createdAt: firstSeenAt.toISOString(),
      updatedAt: firstSeenAt.toISOString(),
      firstSeenAt: firstSeenAt.toISOString(),
      lastSeenAt: firstSeenAt.toISOString(),
    })
  })

  it('requests deletion once and reports pending cleanup', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => 'ipr_1',
        identityLinkId: () => 'ilk_1',
        identityRedactionId: () => 'ird_1',
      },
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: undefined,
      anonymousIdentityId: undefined,
      now: firstSeenAt,
    })

    await expect(
      repository.requestDeletion({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        now: later,
      }),
    ).resolves.toEqual({
      kind: 'accepted',
      output: { accepted: true, status: 'deletion-requested' },
    })
    await expect(
      repository.requestDeletion({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        now: later,
      }),
    ).resolves.toEqual({ kind: 'conflict' })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toEqual({ status: 'deletion-requested' })
    await expect(
      repository.getDeletionStatus({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toEqual({
      status: 'deletion-requested',
      updatedAt: later.toISOString(),
      derivedCleanup: { status: 'pending', updatedAt: later.toISOString() },
      backupCleanup: { status: 'pending', updatedAt: later.toISOString() },
    })
  })

  it('starts a new epoch only after the old redaction is complete', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => 'ipr_1',
        identityLinkId: (() => {
          let next = 0
          return () => `ilk_${++next}`
        })(),
        identityRedactionId: () => 'ird_1',
      },
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: { plan: 'pro' },
      anonymousIdentityId: 'ano_old',
      now: firstSeenAt,
    })
    await repository.requestDeletion({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      now: later,
    })
    fixture.db
      .update(schema.TIdentityProfileEpoch)
      .set({ status: 'redacted', endedAt: later, redactedAt: later })
      .where(eq(schema.TIdentityProfileEpoch.epoch, 1))
      .run()
    fixture.db
      .update(schema.TIdentityRedaction)
      .set({
        status: 'applied',
        appliedAt: later,
        derivedCleanupStatus: 'complete',
        backupCleanupStatus: 'complete',
        derivedCleanupUpdatedAt: later,
        backupCleanupUpdatedAt: later,
        updatedAt: later,
      })
      .run()
    fixture.db
      .update(schema.TIdentityProfile)
      .set({ status: 'deleted', updatedAt: later })
      .where(eq(schema.TIdentityProfile.profileId, 'ipr_1'))
      .run()

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { plan: 'enterprise' },
        anonymousIdentityId: 'ano_new',
        now: new Date(later.getTime() + 1),
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({
      status: 'active',
      profileEpoch: 2,
      traits: { plan: 'enterprise' },
      aliases: ['ano_new'],
      identityHistory: [
        { epoch: 1, status: 'redacted' },
        { epoch: 2, status: 'active' },
      ],
    })
  })

  it('starts epoch 33 while exposing only the latest 32 history entries', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => 'ipr_1',
        identityLinkId: () => 'ilk_1',
        identityRedactionId: () => 'ird_1',
      },
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: undefined,
      anonymousIdentityId: undefined,
      now: firstSeenAt,
    })
    const endedAt = later
    fixture.db
      .update(schema.TIdentityProfileEpoch)
      .set({ status: 'redacted', endedAt, redactedAt: endedAt })
      .where(eq(schema.TIdentityProfileEpoch.epoch, 1))
      .run()
    for (let epoch = 2; epoch <= 32; epoch += 1) {
      fixture.db
        .insert(schema.TIdentityProfileEpoch)
        .values({
          profileId: 'ipr_1',
          siteId: 'ste_1',
          identifiedUserId: 'app_user_1',
          epoch,
          status: 'redacted',
          startedAt: firstSeenAt,
          endedAt,
          redactedAt: endedAt,
        })
        .run()
    }
    fixture.db
      .update(schema.TIdentityProfile)
      .set({ status: 'deleted', profileEpoch: 32, updatedAt: endedAt })
      .where(eq(schema.TIdentityProfile.profileId, 'ipr_1'))
      .run()
    fixture.db
      .insert(schema.TIdentityRedaction)
      .values({
        id: 'ird_32',
        siteId: 'ste_1',
        profileId: 'ipr_1',
        identifiedUserId: 'app_user_1',
        profileEpoch: 32,
        reason: 'explicit',
        status: 'applied',
        requestedAt: endedAt,
        appliedAt: endedAt,
        derivedCleanupStatus: 'complete',
        backupCleanupStatus: 'complete',
        derivedCleanupUpdatedAt: endedAt,
        backupCleanupUpdatedAt: endedAt,
        createdAt: endedAt,
        updatedAt: endedAt,
      })
      .run()

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { plan: 'enterprise' },
        anonymousIdentityId: undefined,
        now: new Date('2026-09-10T06:10:00.000Z'),
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({
      profileEpoch: 33,
    })
    const profile = await repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' })
    if (profile?.status !== 'active') throw new Error('Expected an active profile')
    expect(profile.identityHistory).toHaveLength(32)
    expect(profile.identityHistory[0]?.epoch).toBe(2)
    expect(profile.identityHistory.at(-1)?.epoch).toBe(33)
  })
})
