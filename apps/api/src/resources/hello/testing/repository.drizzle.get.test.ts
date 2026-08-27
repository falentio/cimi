import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HelloRepositoryDrizzle } from '../repository.drizzle.ts'
import { createHelloDbFixture, createHelloRecord, destroyHelloDbFixture } from '../fixtures.ts'

describe('HelloRepositoryDrizzle.get', () => {
  let fixture: Awaited<ReturnType<typeof createHelloDbFixture>>

  beforeEach(async () => {
    fixture = await createHelloDbFixture()
  })

  afterEach(() => destroyHelloDbFixture(fixture))

  it('returns an existing greeting and omits missing records', async () => {
    const repo = new HelloRepositoryDrizzle({ db: fixture.db })
    await repo.insert(createHelloRecord())

    await expect(repo.findById('hello_1')).resolves.toMatchObject({
      id: 'hello_1',
      ownerId: 'user_1',
      createdAt: '2026-08-25T00:00:00.000Z',
    })
    await expect(repo.findById('missing')).resolves.toBeUndefined()
  })
})
