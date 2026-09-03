import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { InstallationRepositoryDrizzle } from '../repository.drizzle.ts'

const createdAt = new Date('2026-09-01T00:00:00.000Z')
const updatedAt = new Date('2026-09-01T00:00:00.000Z')
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

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

function beginUpgradeInput(operationId: string, now: Date, artifactId = 'bar_1') {
  return {
    operationId,
    activeOperation: {
      phase: 'pre_upgrade_safety',
      progress: 0 as number | null,
      lastSafeSequence: null as number | null,
      errorCode: null as null,
    },
    artifact: {
      id: artifactId,
      generationId: operationId,
      storageKey: `safety/${operationId}`,
      schemaVersion: '1',
      sizeBytes: 0,
      checksumAlgorithm: 'sha256',
      checksumValue: EMPTY_SHA256,
    },
    now,
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
  })

  it('persists an update', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
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

  it('persists retention and dataDirectoryReady on update', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
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
      retention: { eventMonths: 24, profileMonths: 24, replayMonths: 6 },
      dataDirectoryReady: false,
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    })

    expect(updated).toMatchObject({
      id: 'ins_1',
      defaultRetention: { eventMonths: 24, profileMonths: 24, replayMonths: 6 },
      dataDirectoryReady: false,
    })
  })

  it('throws when beginning an upgrade without an installation', async () => {
    using fixture = createInstallationDrizzleFixture()

    await expect(
      fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt)),
    ).rejects.toThrow('Installation is not initialized')
  })

  it('persists maintenance with backup rows on beginUpgrade', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
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
      activeOperation: expect.objectContaining({ operationId: 'bop_1', kind: 'upgrade' }),
    })
    const operations = fixture.db
      .select()
      .from(schema.TBackupOperation)
      .where(eq(schema.TBackupOperation.id, 'bop_1'))
      .all()
    expect(operations).toHaveLength(1)
    const artifacts = fixture.db
      .select()
      .from(schema.TBackupArtifact)
      .where(eq(schema.TBackupArtifact.operationId, 'bop_1'))
      .all()
    expect(artifacts).toHaveLength(1)
  })

  it('stores strict operation and artifact rows on beginUpgrade', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
      dataDirectoryReady: true,
      createdAt,
      updatedAt,
    })

    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))

    const operations = fixture.db
      .select()
      .from(schema.TBackupOperation)
      .where(eq(schema.TBackupOperation.id, 'bop_1'))
      .all()
    expect(operations[0]).toMatchObject({
      operationType: 'backup',
      status: 'creating',
      scope: 'installation',
      id: 'bop_1',
    })
    const artifacts = fixture.db
      .select()
      .from(schema.TBackupArtifact)
      .where(eq(schema.TBackupArtifact.operationId, 'bop_1'))
      .all()
    expect(artifacts[0]).toMatchObject({
      id: 'bar_1',
      generationId: 'bop_1',
      storageKey: 'safety/bop_1',
      checksumValue: EMPTY_SHA256,
    })
  })

  it('rejects a duplicate insert', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
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
        beginUpgradeInput('bop_1', new Date('2026-09-02T00:00:00.000Z'), 'bar_2'),
      ),
    ).rejects.toThrow(/constraint|unique|reserved/i)

    const current = await fixture.repository.find()
    expect(current?.activeOperation).toMatchObject({ operationId: 'bop_1' })
    expect(current?.updatedAt).toBe(updatedAt.toISOString())
  })

  it('throws on an inconsistent active operation row', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert({
      id: 'ins_1',
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
