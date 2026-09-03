import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HelloRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createHelloDrizzleFixture,
  createHelloRow,
  destroyHelloDrizzleFixture,
} from '../fixture.drizzle.ts'

describe('HelloRepositoryDrizzle.remove', () => {
  let fixture: Awaited<ReturnType<typeof createHelloDrizzleFixture>>

  beforeEach(async () => {
    fixture = await createHelloDrizzleFixture()
  })

  afterEach(() => destroyHelloDrizzleFixture(fixture))

  it('deletes only the matching owner and reports missing rows', async () => {
    const repo = new HelloRepositoryDrizzle({ db: fixture.db })
    await repo.insert(createHelloRow())

    await expect(repo.deleteById('hello_1', 'user_2')).resolves.toBe(false)
    await expect(repo.deleteById('hello_1', 'user_1')).resolves.toBe(true)
    await expect(repo.findById('hello_1')).resolves.toBeUndefined()
    await expect(repo.deleteById('hello_1', 'user_1')).resolves.toBe(false)
  })
})
