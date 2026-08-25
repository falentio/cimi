import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixtures.ts'

describe('HelloGuard list access', () => {
  it('does not inspect ownership for the public list operation', async () => {
    const { service, findOwnerId } = createHelloFixture()

    await expect(service.list({})).resolves.toMatchObject({ items: [] })
    expect(findOwnerId).not.toHaveBeenCalled()
  })
})
