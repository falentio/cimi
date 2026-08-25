import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HelloRepositoryDrizzle } from '../repository.drizzle.ts'
import { createHelloDbFixture, createHelloRecord, destroyHelloDbFixture } from '../fixtures.ts'

describe('HelloRepositoryDrizzle.create', () => {
  let fixture: Awaited<ReturnType<typeof createHelloDbFixture>>

  beforeEach(async () => {
    fixture = await createHelloDbFixture()
  })

  afterEach(() => destroyHelloDbFixture(fixture))

  it('persists and returns a greeting', async () => {
    const repo = new HelloRepositoryDrizzle(fixture.db)

    await expect(repo.insert(createHelloRecord())).resolves.toMatchObject({
      id: 'hello_1',
      ownerId: 'user_1',
      name: 'Ada',
      message: 'Hello, Ada!',
      createdAt: '2026-08-25T00:00:00.000Z',
    })
  })
})
