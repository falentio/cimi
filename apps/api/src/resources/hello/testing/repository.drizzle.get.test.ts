import { describe, expect, it } from 'vitest'
import { HelloRepositoryDrizzle } from '../repository.drizzle.ts'
import { createHelloDrizzleFixture, createHelloRow } from '../fixture.drizzle.ts'

describe.concurrent('HelloRepositoryDrizzle.get', () => {
  it('returns an existing greeting and omits missing records', async () => {
    using fixture = await createHelloDrizzleFixture()
    const repo = new HelloRepositoryDrizzle({ db: fixture.db })
    await repo.insert(createHelloRow())

    await expect(repo.findById('hello_1')).resolves.toMatchObject({
      id: 'hello_1',
      ownerId: 'user_1',
      createdAt: '2026-08-25T00:00:00.000Z',
    })
    await expect(repo.findById('missing')).resolves.toBeUndefined()
  })
})
