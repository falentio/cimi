import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HelloRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createHelloDrizzleFixture,
  createHelloRow,
  destroyHelloDrizzleFixture,
} from '../fixture.drizzle.ts'

describe('HelloRepositoryDrizzle.create', () => {
  let fixture: Awaited<ReturnType<typeof createHelloDrizzleFixture>>

  beforeEach(async () => {
    fixture = await createHelloDrizzleFixture()
  })

  afterEach(() => destroyHelloDrizzleFixture(fixture))

  it('persists and returns a greeting', async () => {
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
