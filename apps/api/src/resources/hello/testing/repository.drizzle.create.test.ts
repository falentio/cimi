import { describe, expect, it } from 'vitest'
import { HelloRepositoryDrizzle } from '../repository.drizzle.ts'
import { createHelloDrizzleFixture, createHelloRow } from '../fixture.drizzle.ts'

describe.concurrent('HelloRepositoryDrizzle.create', () => {
  it('persists and returns a greeting', async () => {
    using fixture = await createHelloDrizzleFixture()
    const repo = new HelloRepositoryDrizzle({ db: fixture.db })

    await expect(repo.insert(createHelloRow())).resolves.toMatchObject({
      id: 'hello_1',
      ownerId: 'user_1',
      name: 'Ada',
      message: 'Hello, Ada!',
      createdAt: '2026-08-25T00:00:00.000Z',
    })
  })
})
