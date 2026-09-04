import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import {
  beginUpgradeInput,
  createInstallationDrizzleFixture,
  createInstallationInsertInput,
  updatedAt,
} from '../fixture.drizzle.ts'

describe('InstallationRepositoryDrizzle.failUpgrade', () => {
  it('persists a terminal internal error and keeps installation non-ready', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
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
      activeOperation: expect.objectContaining({
        operationId: 'bop_1',
        kind: 'upgrade',
        phase: 'pre_upgrade_safety',
        errorCode: 'INTERNAL_SERVER_ERROR',
      }),
      updatedAt: new Date('2026-09-01T00:04:00.000Z').toISOString(),
    })
  })

  it('preserves checkpoint and progress on terminal failure', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))
    await fixture.repository.recordSafetyArtifact({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      artifact: {
        id: 'bar_1',
        generationId: 'bop_1',
        storageKey: 'safety/bop_1.sqlite',
        schemaVersion: '1',
        sizeBytes: 8,
        checksumAlgorithm: 'sha256',
        checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      },
      now: new Date('2026-09-01T00:02:00.000Z'),
    })

    await fixture.repository.failUpgrade({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      errorCode: 'INSUFFICIENT_STORAGE',
      now: new Date('2026-09-01T00:04:00.000Z'),
    })

    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'degraded',
      activeOperation: expect.objectContaining({
        operationId: 'bop_1',
        checkpoint: 'sqlite_captured',
        errorCode: 'INSUFFICIENT_STORAGE',
      }),
    })
  })

  it('returns undefined when failing without an active operation', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

    await expect(
      fixture.repository.failUpgrade({
        operationId: 'bop_1',
        ownerToken: 'owner_1',
        now: new Date('2026-09-01T00:04:00.000Z'),
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
      fixture.repository.failUpgrade({
        operationId: 'bop_2',
        ownerToken: 'owner_1',
        now: new Date('2026-09-01T00:04:00.000Z'),
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
      fixture.repository.failUpgrade({
        operationId: 'bop_1',
        ownerToken: 'owner_2',
        now: new Date('2026-09-01T00:04:00.000Z'),
      }),
    ).resolves.toBeUndefined()
    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'maintenance',
      activeOperation: expect.objectContaining({ operationId: 'bop_1' }),
    })
  })

  it('returns undefined when failing twice', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))
    await fixture.repository.failUpgrade({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:04:00.000Z'),
    })

    await expect(
      fixture.repository.failUpgrade({
        operationId: 'bop_1',
        ownerToken: 'owner_1',
        now: new Date('2026-09-01T00:05:00.000Z'),
      }),
    ).resolves.toBeUndefined()
    await expect(fixture.repository.find()).resolves.toMatchObject({
      status: 'degraded',
      activeOperation: expect.objectContaining({
        operationId: 'bop_1',
        errorCode: 'INTERNAL_SERVER_ERROR',
      }),
      updatedAt: new Date('2026-09-01T00:04:00.000Z').toISOString(),
    })
  })

  it('begins a new operation after failing', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', updatedAt))
    await fixture.repository.failUpgrade({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:04:00.000Z'),
    })

    const record = await fixture.repository.beginUpgrade(
      beginUpgradeInput('bop_2', new Date('2026-09-01T00:05:00.000Z')),
    )

    expect(record).toMatchObject({
      status: 'maintenance',
      activeOperation: expect.objectContaining({ operationId: 'bop_2' }),
    })
  })
})
