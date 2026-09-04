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
})
