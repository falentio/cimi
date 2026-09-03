import { describe, expect, it } from 'vitest'
import { HelloRepositoryDrizzle } from '../repository.drizzle.ts'
import { createHelloDrizzleFixture, createHelloRow } from '../fixture.drizzle.ts'

describe.concurrent('HelloRepositoryDrizzle.findOwnerId', () => {
  it('returns the owner id and omits missing records', async () => {
    using fixture = await createHelloDrizzleFixture()
    const repo = new HelloRepositoryDrizzle({ db: fixture.db })
    await repo.insert(createHelloRow())

    await expect(repo.findOwnerId('hello_1')).resolves.toBe('user_1')
    await expect(repo.findOwnerId('missing')).resolves.toBeUndefined()
  })
})
