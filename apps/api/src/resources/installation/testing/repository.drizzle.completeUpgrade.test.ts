import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import {
  beginUpgradeInput,
  createInstallationDrizzleFixture,
  createInstallationInsertInput,
  safetyArtifact,
  updatedAt,
} from '../fixture.drizzle.ts'

describe('InstallationRepositoryDrizzle.completeUpgrade', () => {
  it('persists artifact metadata and terminal progress transitions', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

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
      updatedAt: new Date('2026-09-01T00:03:00.000Z').toISOString(),
    })
  })

  it('returns undefined when completing without an active operation', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

    await expect(
      fixture.repository.completeUpgrade({
        operationId: 'bop_1',
        ownerToken: 'owner_1',
        now: new Date('2026-09-01T00:03:00.000Z'),
      }),
    ).resolves.toBeUndefined()
    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'ready',
      activeOperation: null,
    })
  })

  it('returns undefined for a mismatched operation id', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))

    await expect(
      fixture.repository.completeUpgrade({
        operationId: 'bop_2',
        ownerToken: 'owner_1',
        now: new Date('2026-09-01T00:03:00.000Z'),
      }),
    ).resolves.toBeUndefined()
    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'maintenance',
      activeOperation: expect.objectContaining({ operationId: 'bop_1' }),
    })
  })

  it('returns undefined for a mismatched owner token', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))

    await expect(
      fixture.repository.completeUpgrade({
        operationId: 'bop_1',
        ownerToken: 'owner_2',
        now: new Date('2026-09-01T00:03:00.000Z'),
      }),
    ).resolves.toBeUndefined()
    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'maintenance',
      activeOperation: expect.objectContaining({ operationId: 'bop_1' }),
    })
  })

  it('returns undefined when completing twice', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))
    await fixture.repository.completeUpgrade({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:03:00.000Z'),
    })

    await expect(
      fixture.repository.completeUpgrade({
        operationId: 'bop_1',
        ownerToken: 'owner_1',
        now: new Date('2026-09-01T00:04:00.000Z'),
      }),
    ).resolves.toBeUndefined()
    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'ready',
      activeOperation: null,
      updatedAt: new Date('2026-09-01T00:03:00.000Z').toISOString(),
    })
  })

  it('begins a new operation after completing', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))
    await fixture.repository.completeUpgrade({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:03:00.000Z'),
    })

    const record = await fixture.repository.beginUpgrade(
      beginUpgradeInput('bop_2', new Date('2026-09-01T00:04:00.000Z')),
    )

    expect(record).toMatchObject({
      status: 'maintenance',
      activeOperation: expect.objectContaining({ operationId: 'bop_2' }),
    })
  })
})
