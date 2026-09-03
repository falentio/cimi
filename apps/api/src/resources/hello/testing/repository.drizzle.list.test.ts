import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HelloRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createHelloDrizzleFixture,
  createHelloRow,
  destroyHelloDrizzleFixture,
} from '../fixture.drizzle.ts'

describe('HelloRepositoryDrizzle.list', () => {
  let fixture: Awaited<ReturnType<typeof createHelloDrizzleFixture>>

  beforeEach(async () => {
    fixture = await createHelloDrizzleFixture()
  })

  afterEach(() => destroyHelloDrizzleFixture(fixture))

  it('filters names and paginates with a stable next offset', async () => {
    const repo = new HelloRepositoryDrizzle({ db: fixture.db })
    await repo.insert(createHelloRow({ id: 'hello_1', name: 'Ada' }))
    await repo.insert(
      createHelloRow({
        id: 'hello_2',
        ownerId: 'user_2',
        name: 'Grace',
        message: 'Hello, Grace!',
      }),
    )

    await expect(repo.findMany({ offset: 0, limit: 1 })).resolves.toMatchObject({
      items: [{ id: 'hello_2' }],
      nextOffset: 1,
      hasMore: true,
      totalCount: 2,
    })
    await expect(repo.findMany({ offset: 0, limit: 20, nameFilter: 'AD' })).resolves.toMatchObject({
      items: [{ id: 'hello_1', name: 'Ada' }],
      totalCount: 1,
      hasMore: false,
      nextOffset: null,
    })
  })
})
