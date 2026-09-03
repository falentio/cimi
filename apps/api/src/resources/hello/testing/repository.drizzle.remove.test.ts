import { describe, expect, it } from 'vitest'
import { HelloRepositoryDrizzle } from '../repository.drizzle.ts'
import { createHelloDrizzleFixture, createHelloRow } from '../fixture.drizzle.ts'

describe.concurrent('HelloRepositoryDrizzle.remove', () => {
  it('deletes only the matching owner and reports missing rows', async () => {
    using fixture = await createHelloDrizzleFixture()
    const repo = new HelloRepositoryDrizzle({ db: fixture.db })
    await repo.insert(createHelloRow())

    await expect(repo.deleteById('hel_1', 'user_2')).resolves.toBe(false)
    await expect(repo.deleteById('hel_1', 'user_1')).resolves.toBe(true)
    await expect(repo.findById('hel_1')).resolves.toBeUndefined()
    await expect(repo.deleteById('hel_1', 'user_1')).resolves.toBe(false)
  })
})
