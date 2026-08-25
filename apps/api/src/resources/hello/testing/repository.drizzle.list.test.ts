import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HelloRepositoryDrizzle } from '../repository.drizzle.ts'
import { createHelloDbFixture, createHelloRecord, destroyHelloDbFixture } from '../fixtures.ts'

describe('HelloRepositoryDrizzle.list', () => {
  let fixture: Awaited<ReturnType<typeof createHelloDbFixture>>

  beforeEach(async () => {
    fixture = await createHelloDbFixture()
  })

  afterEach(() => destroyHelloDbFixture(fixture))

  it('filters names and paginates with a stable next offset', async () => {
    const repo = new HelloRepositoryDrizzle(fixture.db)
    await repo.insert(createHelloRecord({ id: 'hello_1', name: 'Ada' }))
    await repo.insert(
      createHelloRecord({
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
