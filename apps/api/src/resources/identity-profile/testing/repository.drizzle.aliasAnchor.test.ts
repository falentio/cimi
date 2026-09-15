import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../repository.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'

describe('IdentityProfileRepositoryDrizzle.aliasAnchor', () => {
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

  it('anchors an alias at now when the latest anonymous Event is outside the session window', async () => {
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
        receiptTime: new Date('2026-09-10T05:00:00.000Z'),
        analyticsSessionId: 'session_old',
        replaySequence: 1,
      },
      {
        eventId: 'event_current',
        receiptTime: new Date('2026-09-10T05:30:00.000Z'),
        analyticsSessionId: 'session_current',
        replaySequence: 2,
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
          occurrenceTime: event.receiptTime,
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

    const now = new Date('2026-09-10T06:10:00.000Z')
    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: undefined,
        anonymousIdentityId: 'ano_1',
        now,
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    expect(
      fixture.db
        .select({ effectiveFrom: schema.TIdentityLink.effectiveFrom })
        .from(schema.TIdentityLink)
        .all(),
    ).toEqual([{ effectiveFrom: now }])
  })

  it('does not relink an alias before its prior redaction boundary', async () => {
    using fixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
      createInstallationInsertInput(),
    )
    const policyRevision = fixture.db.$client
      .prepare('SELECT id FROM collection_policy_revision LIMIT 1')
      .get() as { readonly id: string }
    const redactedAt = new Date('2026-09-10T05:30:00.000Z')
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
        now: new Date('2026-09-10T05:10:00.000Z'),
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    expect(
      fixture.db
        .select({ effectiveFrom: schema.TIdentityLink.effectiveFrom })
        .from(schema.TIdentityLink)
        .all(),
    ).toEqual([{ effectiveFrom: redactedAt }])
  })
})
