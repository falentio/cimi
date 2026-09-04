import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import {
  createInstallationDrizzleFixture,
  createInstallationInsertInput,
} from '../fixture.drizzle.ts'

describe('InstallationRepositoryDrizzle.find', () => {
  it('returns undefined when no installation exists', async () => {
    using fixture = createInstallationDrizzleFixture()

    await expect(fixture.repository.find()).resolves.toBeUndefined()
  })

  it('throws on an inconsistent active operation row', async () => {
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput())
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
