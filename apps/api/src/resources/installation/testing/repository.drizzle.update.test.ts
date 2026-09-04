import { describe, expect, it } from 'vitest'
import {
  createInstallationDrizzleFixture,
  createInstallationInsertInput,
  updatedAt,
} from '../fixture.drizzle.ts'

describe('InstallationRepositoryDrizzle.update', () => {
  it('persists an update', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

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
    await fixture.repository.insert(createInstallationInsertInput())

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

  it('sets then clears the active operation', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

    const set = await fixture.repository.update({
      status: 'maintenance',
      activeOperation: {
        operationId: 'bop_1',
        kind: 'upgrade',
        phase: 'pre_upgrade_safety',
        checkpoint: 'none',
        progress: 0.5,
        lastSafeSequence: null,
        errorCode: null,
      },
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    })

    expect(set).toMatchObject({
      status: 'maintenance',
      activeOperation: {
        operationId: 'bop_1',
        kind: 'upgrade',
        phase: 'pre_upgrade_safety',
        checkpoint: 'none',
        progress: 0.5,
        lastSafeSequence: null,
        errorCode: null,
      },
    })
    await expect(fixture.repository.find()).resolves.toMatchObject({
      activeOperation: { operationId: 'bop_1', kind: 'upgrade' },
    })

    const cleared = await fixture.repository.update({
      status: 'ready',
      activeOperation: null,
      updatedAt: new Date('2026-09-03T00:00:00.000Z'),
    })

    expect(cleared?.activeOperation).toBeNull()
    await expect(fixture.repository.find()).resolves.toMatchObject({ activeOperation: null })
  })

  it('advances updatedAt on update', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

    const updated = await fixture.repository.update({
      status: 'degraded',
      activeOperation: null,
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    })

    expect(updated?.updatedAt).toBe('2026-09-02T00:00:00.000Z')
    await expect(fixture.repository.find()).resolves.toMatchObject({
      updatedAt: '2026-09-02T00:00:00.000Z',
    })
  })

  it('leaves retention unchanged by status update', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

    const updated = await fixture.repository.update({
      status: 'degraded',
      activeOperation: null,
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    })

    expect(updated).toMatchObject({
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    })
    await expect(fixture.repository.find()).resolves.toMatchObject({
      defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    })
  })

  it('overwrites status without a transition guard', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())

    await expect(
      fixture.repository.update({
        status: 'maintenance',
        activeOperation: null,
        updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ status: 'maintenance' })
    await expect(
      fixture.repository.update({
        status: 'ready',
        activeOperation: null,
        updatedAt: new Date('2026-09-03T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ status: 'ready' })
  })
})
