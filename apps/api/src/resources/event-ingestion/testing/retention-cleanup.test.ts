import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { closeDb, createDb, migrateControlDb, schema } from '@cimi/db'
import { createTestAnalyticsDb } from '@cimi/db/testing'
import { mock } from 'vitest-mock-extended'
import type { AcceptanceRepository } from '../repository.ts'
import { AcceptanceBackupRestoreCleanup, AcceptanceRetentionCleanup } from '../retention-cleanup.ts'
import {
  createSiteDrizzleFixture,
  createSiteMembershipRow,
  createSiteOrganizationRow,
  createSiteRow,
  createSiteUserRow,
} from '../../site/fixture.drizzle.ts'
import type { RetentionPolicyRepository } from '../../retention-policy/repository.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'

const now = new Date('2026-09-05T14:30:00.000Z')

async function createAnalyticsFixture() {
  const analytics = await createTestAnalyticsDb()
  return {
    analytics,
    async [Symbol.asyncDispose]() {
      await analytics.close()
    },
  }
}

function boundary(): RetentionPolicyRepository.SiteRetentionBoundary {
  return {
    siteId: 'ste_1',
    installationId: 'ins_1',
    policyId: 'rtn_1',
    reportingTimezone: 'UTC',
    localDay: '2026-09-05',
    eventOccurrenceCutoffAt: new Date('2026-03-05T00:00:00.000Z'),
    rawReceiptCutoffAt: new Date('2026-03-05T00:00:00.000Z'),
    profileActivityCutoffAt: new Date('2026-06-05T00:00:00.000Z'),
    replayReceiptCutoffAt: null,
    effectiveAt: now,
    updatedAt: now,
  }
}

describe('AcceptanceRetentionCleanup', () => {
  it('processes an explicit identity redaction through both cleanup stages', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db
      .insert(schema.TIdentityProfile)
      .values({
        profileId: 'profile_1',
        siteId: 'ste_1',
        identifiedUserId: 'user_1',
        status: 'deletion-requested',
        profileEpoch: 1,
        traits: { plan: 'pro' },
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
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
        startedAt: now,
        endedAt: null,
        redactedAt: null,
      })
      .run()
    fixture.db
      .insert(schema.TIdentityRedaction)
      .values({
        id: 'redaction_1',
        siteId: 'ste_1',
        profileId: 'profile_1',
        identifiedUserId: 'user_1',
        profileEpoch: 1,
        reason: 'explicit',
        status: 'requested',
        requestedAt: now,
        appliedAt: null,
        derivedCleanupStatus: 'pending',
        backupCleanupStatus: 'pending',
        derivedCleanupUpdatedAt: now,
        backupCleanupUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    await using analyticsFixture = await createAnalyticsFixture()
    const cleanup = new AcceptanceRetentionCleanup({
      acceptance: mock<AcceptanceRepository>(),
      analytics: analyticsFixture.analytics,
      db: fixture.db,
      dataDirectoryPath: tmpdir(),
    })

    await cleanup.runIdentityDerived({ now })
    expect(fixture.db.select().from(schema.TIdentityProfile).all()).toMatchObject([
      { status: 'deleted', traits: null },
    ])
    expect(
      fixture.db
        .select({
          status: schema.TIdentityRedaction.status,
          derivedCleanupStatus: schema.TIdentityRedaction.derivedCleanupStatus,
        })
        .from(schema.TIdentityRedaction)
        .all(),
    ).toEqual([{ status: 'applied', derivedCleanupStatus: 'complete' }])

    await cleanup.runIdentityBackup({ now })
    expect(
      fixture.db
        .select({ backupCleanupStatus: schema.TIdentityRedaction.backupCleanupStatus })
        .from(schema.TIdentityRedaction)
        .all(),
    ).toEqual([{ backupCleanupStatus: 'complete' }])
  })

  it('redacts expired profile data and rebuilds identity projections', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db
      .insert(schema.TIdentityProfile)
      .values({
        profileId: 'profile_1',
        siteId: 'ste_1',
        identifiedUserId: 'user_1',
        status: 'deletion-requested',
        profileEpoch: 1,
        traits: { plan: 'pro' },
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
    fixture.db
      .insert(schema.TIdentityLink)
      .values({
        id: 'link_1',
        siteId: 'ste_1',
        profileId: 'profile_1',
        profileEpoch: 1,
        anonymousIdentityId: 'anonymous_1',
        analyticsSessionId: 'session_1',
        effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
        linkedAt: new Date('2025-01-01T00:00:00.000Z'),
        unlinkedAt: null,
      })
      .run()
    fixture.db
      .insert(schema.TIdentityRedaction)
      .values({
        id: 'redaction_1',
        siteId: 'ste_1',
        profileId: 'profile_1',
        identifiedUserId: 'user_1',
        profileEpoch: 1,
        reason: 'retention',
        status: 'requested',
        requestedAt: now,
        appliedAt: null,
        derivedCleanupStatus: 'pending',
        backupCleanupStatus: 'pending',
        derivedCleanupUpdatedAt: now,
        backupCleanupUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    await using analyticsFixture = await createAnalyticsFixture()
    const { analytics } = analyticsFixture
    const acceptance = mock<AcceptanceRepository>()
    acceptance.deleteExpired.mockImplementation(async () => {
      expect(
        fixture.db
          .select({
            status: schema.TIdentityRedaction.status,
            derivedCleanupStatus: schema.TIdentityRedaction.derivedCleanupStatus,
          })
          .from(schema.TIdentityRedaction)
          .all(),
      ).toEqual([{ status: 'applied', derivedCleanupStatus: 'complete' }])
      return 0
    })
    const cleanup = new AcceptanceRetentionCleanup({
      acceptance,
      analytics,
      db: fixture.db,
    })

    await cleanup.runDerived({
      runId: 'run_1',
      siteId: 'ste_1',
      now,
      boundary: boundary(),
      checkpoints: [
        {
          id: 'checkpoint_1',
          dataClass: 'profiles',
          stage: 'derived',
          cursor: null,
          processedThrough: null,
          status: 'running',
          updatedAt: now,
        },
        {
          id: 'checkpoint_2',
          dataClass: 'identity-projections',
          stage: 'derived',
          cursor: null,
          processedThrough: null,
          status: 'running',
          updatedAt: now,
        },
        {
          id: 'checkpoint_3',
          dataClass: 'accepted-events',
          stage: 'derived',
          cursor: null,
          processedThrough: null,
          status: 'running',
          updatedAt: now,
        },
      ],
    })

    expect(
      fixture.db
        .select({ status: schema.TIdentityProfile.status, traits: schema.TIdentityProfile.traits })
        .from(schema.TIdentityProfile)
        .all(),
    ).toEqual([{ status: 'deleted', traits: null }])
    expect(fixture.db.select().from(schema.TIdentityLink).all()).toHaveLength(0)
    expect(
      fixture.db
        .select({ status: schema.TIdentityProfileEpoch.status })
        .from(schema.TIdentityProfileEpoch)
        .all(),
    ).toEqual([{ status: 'redacted' }])
    expect(
      fixture.db
        .select({
          status: schema.TIdentityRedaction.status,
          derivedCleanupStatus: schema.TIdentityRedaction.derivedCleanupStatus,
        })
        .from(schema.TIdentityRedaction)
        .all(),
    ).toEqual([{ status: 'applied', derivedCleanupStatus: 'complete' }])
    expect(acceptance.deleteExpired).toHaveBeenCalledWith({
      siteId: 'ste_1',
      receiptCutoff: boundary().rawReceiptCutoffAt,
    })
  })

  it('keeps derived cleanup pending when rebuilding analytics fails', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db
      .insert(schema.TIdentityProfile)
      .values({
        profileId: 'profile_1',
        siteId: 'ste_1',
        identifiedUserId: 'user_1',
        status: 'deletion-requested',
        profileEpoch: 1,
        traits: { plan: 'pro' },
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
    fixture.db
      .insert(schema.TIdentityRedaction)
      .values({
        id: 'redaction_1',
        siteId: 'ste_1',
        profileId: 'profile_1',
        identifiedUserId: 'user_1',
        profileEpoch: 1,
        reason: 'retention',
        status: 'requested',
        requestedAt: now,
        appliedAt: null,
        derivedCleanupStatus: 'pending',
        backupCleanupStatus: 'pending',
        derivedCleanupUpdatedAt: now,
        backupCleanupUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    await using analyticsFixture = await createAnalyticsFixture()
    const { analytics } = analyticsFixture
    await analytics.close()
    const cleanup = new AcceptanceRetentionCleanup({
      acceptance: mock<AcceptanceRepository>(),
      analytics,
      db: fixture.db,
    })

    await expect(
      cleanup.runDerived({
        runId: 'run_1',
        siteId: 'ste_1',
        now,
        boundary: boundary(),
        checkpoints: [
          {
            id: 'checkpoint_1',
            dataClass: 'profiles',
            stage: 'derived',
            cursor: null,
            processedThrough: null,
            status: 'running',
            updatedAt: now,
          },
        ],
      }),
    ).rejects.toThrow()

    expect(
      fixture.db
        .select({
          status: schema.TIdentityRedaction.status,
          derivedCleanupStatus: schema.TIdentityRedaction.derivedCleanupStatus,
        })
        .from(schema.TIdentityRedaction)
        .all(),
    ).toEqual([{ status: 'requested', derivedCleanupStatus: 'pending' }])
  })

  it('uses the replay cutoff for replay material cleanup', async () => {
    const acceptance = mock<AcceptanceRepository>()
    acceptance.deleteExpiredReplayMaterial.mockResolvedValue(1)
    const cleanup = new AcceptanceRetentionCleanup({ acceptance })
    const replayCutoff = new Date('2026-08-05T00:00:00.000Z')

    await cleanup.runDerived({
      runId: 'run_1',
      siteId: 'ste_1',
      now,
      boundary: { ...boundary(), replayReceiptCutoffAt: replayCutoff },
      checkpoints: [
        {
          id: 'checkpoint_1',
          dataClass: 'replay-material',
          stage: 'derived',
          cursor: null,
          processedThrough: null,
          status: 'running',
          updatedAt: now,
        },
      ],
    })

    expect(acceptance.deleteExpiredReplayMaterial).toHaveBeenCalledWith({
      siteId: 'ste_1',
      receiptCutoff: replayCutoff,
    })
  })

  it('cleans every effective boundary after a restore', async () => {
    using fixture = createSiteDrizzleFixture()
    const installation = new InstallationRepositoryDrizzle({ db: fixture.db })
    await installation.insert(createInstallationInsertInput())
    fixture.db
      .insert(schema.TRetentionEffectiveCutoff)
      .values({
        siteId: 'ste_1',
        installationId: 'ins_1',
        policyId: 'rtn_1',
        reportingTimezone: 'UTC',
        localDay: '2026-09-05',
        eventOccurrenceCutoffAt: new Date('2026-03-05T00:00:00.000Z'),
        rawReceiptCutoffAt: new Date('2026-03-05T00:00:00.000Z'),
        profileActivityCutoffAt: new Date('2026-06-05T00:00:00.000Z'),
        replayReceiptCutoffAt: new Date('2026-08-05T00:00:00.000Z'),
        effectiveAt: now,
        updatedAt: now,
      })
      .run()
    const acceptance = mock<AcceptanceRepository>()
    await using analyticsFixture = await createAnalyticsFixture()
    const cleanup = new AcceptanceBackupRestoreCleanup({
      acceptance,
      analytics: analyticsFixture.analytics,
      db: fixture.db,
      dataDirectoryPath: tmpdir(),
      clock: () => now,
    })

    await cleanup.runDerived({ operationId: 'bop_restore' })

    expect(acceptance.deleteExpiredReplayMaterial).toHaveBeenCalledWith({
      siteId: 'ste_1',
      receiptCutoff: new Date('2026-08-05T00:00:00.000Z'),
    })
    expect(acceptance.deleteExpired).toHaveBeenCalledWith({
      siteId: 'ste_1',
      receiptCutoff: new Date('2026-03-05T00:00:00.000Z'),
    })
  })

  it('scrubs identified event references before completing backup cleanup', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db
      .insert(schema.TIdentityProfile)
      .values({
        profileId: 'profile_1',
        siteId: 'ste_1',
        identifiedUserId: 'user_1',
        status: 'deleted',
        profileEpoch: 1,
        traits: null,
        firstSeenAt: new Date('2025-01-01T00:00:00.000Z'),
        lastSeenAt: new Date('2025-01-01T00:00:00.000Z'),
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: now,
      })
      .run()
    fixture.db
      .insert(schema.TIdentityProfileEpoch)
      .values({
        profileId: 'profile_1',
        siteId: 'ste_1',
        identifiedUserId: 'user_1',
        epoch: 1,
        status: 'redacted',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: now,
        redactedAt: now,
      })
      .run()
    fixture.db
      .insert(schema.TIdentityRedaction)
      .values({
        id: 'redaction_1',
        siteId: 'ste_1',
        profileId: 'profile_1',
        identifiedUserId: 'user_1',
        profileEpoch: 1,
        reason: 'retention',
        status: 'applied',
        requestedAt: now,
        appliedAt: now,
        derivedCleanupStatus: 'complete',
        backupCleanupStatus: 'pending',
        derivedCleanupUpdatedAt: now,
        backupCleanupUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const installation = new InstallationRepositoryDrizzle({ db: fixture.db })
    await installation.insert(createInstallationInsertInput())
    fixture.db
      .insert(schema.TBackupOperation)
      .values({
        id: 'backup-operation-1',
        operationType: 'backup',
        status: 'available',
        phase: 'ready',
        progress: 1,
        checkpoint: 'structurally_ready',
        lastSafeSequence: 1,
        controlReadiness: 'ready',
        analyticsReadiness: 'ready',
        structuralReadiness: 'ready',
        cleanupPending: false,
        errorCode: null,
        recoveryKey: null,
        createdAt: now,
        startedAt: now,
        completedAt: now,
        updatedAt: now,
        ownerToken: null,
      })
      .run()

    const directory = await mkdtemp(join(tmpdir(), 'cimi-backup-retention-'))
    const backupPath = join(directory, 'backups', 'backup-operation-1.sqlite')
    await mkdir(join(directory, 'backups'), { recursive: true })
    const backupDb = createDb({ path: backupPath })
    try {
      migrateControlDb(backupDb)
      await new InstallationRepositoryDrizzle({ db: backupDb }).insert(
        createInstallationInsertInput(),
      )
      backupDb.insert(schema.TUser).values(createSiteUserRow()).run()
      backupDb.insert(schema.TOrganization).values(createSiteOrganizationRow()).run()
      backupDb.insert(schema.TMembership).values(createSiteMembershipRow()).run()
      backupDb.insert(schema.TSite).values(createSiteRow()).run()
      const backupRevision = backupDb.$client
        .prepare('SELECT id FROM collection_policy_revision LIMIT 1')
        .get() as { id: string }
      backupDb
        .insert(schema.TIdentityProfile)
        .values({
          profileId: 'profile_1',
          siteId: 'ste_1',
          identifiedUserId: 'user_1',
          status: 'active',
          profileEpoch: 1,
          traits: { plan: 'pro' },
          firstSeenAt: new Date('2025-01-01T00:00:00.000Z'),
          lastSeenAt: now,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: now,
        })
        .run()
      backupDb
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
      backupDb
        .insert(schema.TIdentityProfile)
        .values({
          profileId: 'profile_2',
          siteId: 'ste_1',
          identifiedUserId: 'user_2',
          status: 'active',
          profileEpoch: 2,
          traits: { plan: 'enterprise' },
          firstSeenAt: new Date('2026-08-15T00:00:00.000Z'),
          lastSeenAt: now,
          createdAt: new Date('2026-08-15T00:00:00.000Z'),
          updatedAt: now,
        })
        .run()
      backupDb
        .insert(schema.TIdentityProfileEpoch)
        .values({
          profileId: 'profile_2',
          siteId: 'ste_1',
          identifiedUserId: 'user_2',
          epoch: 2,
          status: 'active',
          startedAt: new Date('2026-08-15T00:00:00.000Z'),
          endedAt: null,
          redactedAt: null,
        })
        .run()
      const acceptedEvent = backupDb
        .insert(schema.TAcceptedEvent)
        .values({
          siteId: 'ste_1',
          eventId: 'event_1',
          eventKind: 'custom_event',
          anonymousIdentityId: null,
          pageViewId: null,
          occurrenceTime: new Date('2026-08-01T00:00:00.000Z'),
          receiptTime: new Date('2026-08-01T00:00:00.000Z'),
          late: false,
          visitorId: 'visitor_1',
          identifiedUserId: 'user_1',
          analyticsSessionId: 'session_1',
          botPolicyOutcome: 'included',
          policyRevisionId: backupRevision.id,
          replaySequence: 1,
          payloadFingerprint: 'fingerprint_1',
          projectionState: 'projected',
          projectedAt: now,
          createdAt: now,
        })
        .returning({ eventPk: schema.TAcceptedEvent.eventPk })
        .all()[0]
      if (acceptedEvent === undefined) throw new Error('Accepted Event insert returned no row')
      backupDb
        .insert(schema.TEventPayload)
        .values({ eventPk: acceptedEvent.eventPk, canonicalPayloadJson: '{}' })
        .run()
      const currentEvent = backupDb
        .insert(schema.TAcceptedEvent)
        .values({
          siteId: 'ste_1',
          eventId: 'event_2',
          eventKind: 'custom_event',
          anonymousIdentityId: null,
          pageViewId: null,
          occurrenceTime: new Date('2026-08-20T00:00:00.000Z'),
          receiptTime: new Date('2026-08-01T00:00:00.000Z'),
          late: false,
          visitorId: 'visitor_2',
          identifiedUserId: 'user_2',
          analyticsSessionId: 'session_2',
          botPolicyOutcome: 'included',
          policyRevisionId: backupRevision.id,
          replaySequence: 2,
          payloadFingerprint: 'fingerprint_2',
          projectionState: 'projected',
          projectedAt: now,
          createdAt: now,
        })
        .returning({ eventPk: schema.TAcceptedEvent.eventPk })
        .all()[0]
      if (currentEvent === undefined) throw new Error('Accepted Event insert returned no row')
      backupDb
        .insert(schema.TEventPayload)
        .values({ eventPk: currentEvent.eventPk, canonicalPayloadJson: '{}' })
        .run()
    } finally {
      closeDb(backupDb)
    }

    fixture.db
      .insert(schema.TBackupArtifact)
      .values({
        id: 'backup-artifact-1',
        operationId: 'backup-operation-1',
        artifactType: 'authoritative_sqlite',
        generationId: 'generation-1',
        storageKey: 'backups/backup-operation-1.sqlite',
        schemaVersion: '1',
        retentionBoundary: null,
        acceptanceSequence: 1,
        sizeBytes: 1,
        checksumAlgorithm: 'sha256',
        checksumValue: 'checksum',
        metadata: null,
        createdAt: now,
      })
      .run()

    const cleanup = new AcceptanceRetentionCleanup({
      acceptance: mock<AcceptanceRepository>(),
      db: fixture.db,
      dataDirectoryPath: directory,
    })
    try {
      await cleanup.runBackup({
        runId: 'run_1',
        siteId: 'ste_1',
        now,
        boundary: { ...boundary(), replayReceiptCutoffAt: new Date('2026-08-05T00:00:00.000Z') },
        checkpoints: [],
      })
      const cleanedBackup = createDb({ path: backupPath })
      try {
        expect(
          cleanedBackup.$client
            .prepare('SELECT identified_user_id AS identifiedUserId FROM accepted_event')
            .all(),
        ).toEqual([{ identifiedUserId: null }, { identifiedUserId: 'user_2' }])
        expect(cleanedBackup.$client.prepare('SELECT event_pk FROM event_payload').all()).toEqual(
          [],
        )
        expect(
          cleanedBackup.$client
            .prepare('SELECT profile_id FROM identity_profile ORDER BY profile_id')
            .all(),
        ).toEqual([{ profile_id: 'profile_2' }])
      } finally {
        closeDb(cleanedBackup)
      }
      expect(
        fixture.db
          .select({ backupCleanupStatus: schema.TIdentityRedaction.backupCleanupStatus })
          .from(schema.TIdentityRedaction)
          .all(),
      ).toEqual([{ backupCleanupStatus: 'complete' }])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
