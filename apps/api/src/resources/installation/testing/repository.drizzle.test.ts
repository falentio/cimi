import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { InstallationRepositoryDrizzle } from '../repository.drizzle.ts'
import type { InstallationRepository } from '../repository.ts'

const createdAt = new Date('2026-09-01T00:00:00.000Z')
const updatedAt = new Date('2026-09-01T00:00:00.000Z')

interface InstallationDrizzleFixture extends Disposable {
  readonly db: Db
  readonly repository: InstallationRepositoryDrizzle
}

function createInstallationDrizzleFixture(): InstallationDrizzleFixture {
  const db = createMigratedTestDb()
  try {
    return {
      db,
      repository: new InstallationRepositoryDrizzle({ db }),
      [Symbol.dispose]() {
        closeDb(db)
      },
    }
  } catch (error) {
    closeDb(db)
    throw error
  }
}

function beginUpgradeInput(
  operationId: string,
  now: Date,
): InstallationRepository.BeginUpgradeInput {
  return {
    operationId,
    ownerToken: 'owner_1',
    activeOperation: {
      phase: 'pre_upgrade_safety',
      checkpoint: 'none',
      progress: 0 as number | null,
      lastSafeSequence: null as number | null,
      errorCode: null as null,
    },
    now,
  }
}

function safetyArtifact(
  operationId = 'bop_1',
  artifactId = 'bar_1',
): InstallationRepository.SafetyArtifactInput {
  return {
    id: artifactId,
    generationId: operationId,
    storageKey: `safety/${operationId}.sqlite`,
    schemaVersion: '1',
    sizeBytes: 8,
    checksumAlgorithm: 'sha256',
    checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  }
}

describe('InstallationRepositoryDrizzle', () => {
  it('returns undefined when no installation exists', async () => {
    using fixture = createInstallationDrizzleFixture()

    await expect(fixture.repository.find()).resolves.toBeUndefined()
  })

  it('round-trips an insert through find', async () => {
    using fixture = createInstallationDrizzleFixture()

    const inserted = await fixture.repository.insert({
      id: 'ins_1',
      retentionPolicyId: 'rtn_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })

    expect(inserted).toMatchObject({ status: 'ready', activeOperation: null })
    await expect(fixture.repository.find()).resolves.toMatchObject({
      id: 'ins_1',
      status: 'ready',
    })
  })

  it('stores insert defaults for cleanup and retention', async () => {
    using fixture = createInstallationDrizzleFixture()

    const inserted = await fixture.repository.insert({
      id: 'ins_1',
      retentionPolicyId: 'rtn_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })

    expect(inserted).toMatchObject({
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      cleanupPending: false,
      derivedCleanup: expect.objectContaining({ status: 'not_applicable' }),
      backupCleanup: expect.objectContaining({ status: 'not_applicable' }),
    })
    expect(inserted.updatedAt).toBe(updatedAt.toISOString())
    expect(
      fixture.db
        .select()
        .from(schema.TRetentionPolicy)
        .where(eq(schema.TRetentionPolicy.installationId, 'ins_1'))
        .all(),
    ).toMatchObject([
      {
        id: 'rtn_1',
        scope: 'installation',
        version: 1,
        status: 'active',
      },
    ])
  })

  it('seeds retention when activating an uninitialized installation', async () => {
    using fixture = createInstallationDrizzleFixture()
    fixture.db
      .insert(schema.TInstallation)
      .values({
        id: 'ins_1',
        singletonKey: 'default',
        status: 'uninitialized',
        eventRetentionMonths: 12,
        profileRetentionMonths: 12,
        replayRetentionMonths: null,
        dataDirectoryReady: true,
        createdAt,
        updatedAt,
      })
      .run()

    await expect(
      fixture.repository.activate({
        retentionPolicyId: 'rtn_1',
        retention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
        dataDirectoryReady: true,
        updatedAt,
      }),
    ).resolves.toMatchObject({ status: 'ready' })
    expect(
      fixture.db
        .select()
        .from(schema.TRetentionPolicy)
        .where(eq(schema.TRetentionPolicy.installationId, 'ins_1'))
        .all(),
    ).toMatchObject([{ id: 'rtn_1', version: 1, status: 'active' }])
  })

  it('persists an update', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
      retentionPolicyId: 'rtn_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })

    const updated = await fixture.repository.update({
      status: 'degraded',
      activeOperation: null,
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    })

    expect(updated).toMatchObject({ status: 'degraded' })
    await expect(fixture.repository.find()).resolves.toMatchObject({ status: 'degraded' })
  })

  it('returns undefined when updating a missing installation', async () => {
    using fixture = createInstallationDrizzleFixture()

    await expect(
      fixture.repository.update({ status: 'ready', activeOperation: null, updatedAt }),
    ).resolves.toBeUndefined()
  })

  it('persists dataDirectoryReady on update', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
      retentionPolicyId: 'rtn_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })

    const updated = await fixture.repository.update({
      status: 'ready',
      activeOperation: null,
      dataDirectoryReady: false,
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    })

    expect(updated).toMatchObject({
      id: 'ins_1',
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      dataDirectoryReady: false,
    })
  })

  it('throws when beginning an upgrade without an installation', async () => {
    using fixture = createInstallationDrizzleFixture()

    await expect(
      fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt)),
    ).rejects.toThrow('Installation is not initialized')
  })

  it('persists an upgrade operation before its artifact exists', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
      retentionPolicyId: 'rtn_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })

    const record = await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))

    expect(record).toMatchObject({
      status: 'maintenance',
      activeOperation: expect.objectContaining({
        operationId: 'bop_1',
        kind: 'upgrade',
        checkpoint: 'none',
      }),
    })
    const operations = fixture.db
      .select()
      .from(schema.TBackupOperation)
      .where(eq(schema.TBackupOperation.id, 'bop_1'))
      .all()
    expect(operations).toHaveLength(1)
    expect(
      fixture.db
        .select()
        .from(schema.TBackupArtifact)
        .where(eq(schema.TBackupArtifact.operationId, 'bop_1'))
        .all(),
    ).toHaveLength(0)
  })

  it('persists artifact metadata and terminal progress transitions', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
      retentionPolicyId: 'rtn_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })

    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))

    await fixture.repository.recordSafetyArtifact({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      artifact: safetyArtifact(),
      now: new Date('2026-09-01T00:01:00.000Z'),
    })
    await fixture.repository.updateUpgradeProgress({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      checkpoint: 'sqlite_captured',
      progress: 0.5,
      backupPhase: 'rebuilding_duckdb',
      now: new Date('2026-09-01T00:02:00.000Z'),
    })

    const operations = fixture.db
      .select()
      .from(schema.TBackupOperation)
      .where(eq(schema.TBackupOperation.id, 'bop_1'))
      .all()
    expect(operations[0]).toMatchObject({
      operationType: 'upgrade',
      status: 'creating',
      scope: 'installation',
      id: 'bop_1',
      checkpoint: 'sqlite_captured',
      progress: 0.5,
      analyticsReadiness: 'rebuilding',
    })
    const artifacts = fixture.db
      .select()
      .from(schema.TBackupArtifact)
      .where(eq(schema.TBackupArtifact.operationId, 'bop_1'))
      .all()
    expect(artifacts[0]).toMatchObject({
      id: 'bar_1',
      generationId: 'bop_1',
      storageKey: 'safety/bop_1.sqlite',
      sizeBytes: 8,
      checksumAlgorithm: 'sha256',
      checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    })

    await fixture.repository.completeUpgrade({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:03:00.000Z'),
    })
    expect(
      fixture.db
        .select()
        .from(schema.TBackupOperation)
        .where(eq(schema.TBackupOperation.id, 'bop_1'))
        .all()[0],
    ).toMatchObject({
      operationType: 'upgrade',
      status: 'available',
      phase: 'ready',
      checkpoint: 'structurally_ready',
      progress: 1,
    })
    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'ready',
      activeOperation: null,
    })
  })

  it('persists a terminal internal error and keeps installation non-ready', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
      retentionPolicyId: 'rtn_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))

    await fixture.repository.failUpgrade({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:04:00.000Z'),
    })

    expect(
      fixture.db
        .select()
        .from(schema.TBackupOperation)
        .where(eq(schema.TBackupOperation.id, 'bop_1'))
        .all()[0],
    ).toMatchObject({ status: 'failed', phase: 'failed', errorCode: 'INTERNAL_SERVER_ERROR' })
    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'degraded',
      activeOperation: null,
    })
  })

  it('rejects a duplicate insert', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
      retentionPolicyId: 'rtn_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })

    await expect(
      fixture.repository.insert({
        id: 'ins_2',
        retentionPolicyId: 'rtn_2',
        eventMonths: 12,
        profileMonths: 12,
        replayMonths: null,
        dataDirectoryReady: true,
        createdAt,
        updatedAt,
      }),
    ).rejects.toThrow(/constraint|unique|reserved/i)
  })

  it('rejects a retention that violates the check', async () => {
    using fixture = createInstallationDrizzleFixture()

    await expect(
      fixture.repository.insert({
        id: 'ins_1',
        retentionPolicyId: 'rtn_1',
        eventMonths: 12,
        profileMonths: 24,
        replayMonths: null,
        dataDirectoryReady: true,
        createdAt,
        updatedAt,
      }),
    ).rejects.toThrow(/constraint/i)
  })

  it('rolls back a failed beginUpgrade', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
      retentionPolicyId: 'rtn_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))

    await expect(
      fixture.repository.beginUpgrade(
        beginUpgradeInput('bop_1', new Date('2026-09-02T00:00:00.000Z')),
      ),
    ).rejects.toThrow(/constraint|unique|reserved|lifecycle operation is active/i)

    const current = await fixture.repository.find()
    expect(current?.activeOperation).toMatchObject({ operationId: 'bop_1' })
    expect(current?.updatedAt).toBe(updatedAt.toISOString())
  })

  it('throws on an inconsistent active operation row', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
      retentionPolicyId: 'rtn_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })
    fixture.db
      .update(schema.TInstallation)
      .set({
        activeOperationId: 'bop_bad',
        activeOperationKind: null,
        activeOperationPhase: null,
      })
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .run()

    await expect(fixture.repository.find()).rejects.toThrow()
  })
})
