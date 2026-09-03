import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixture.ts'

describe('HelloGuard list access', () => {
  it('does not inspect ownership for the public list operation', async () => {
    const { service, repo } = createHelloFixture()
    repo.findMany.mockResolvedValue({
      items: [],
      nextOffset: null,
      hasMore: false,
      totalCount: 0,
    })

    await expect(service.list({})).resolves.toMatchObject({ items: [] })
    expect(repo.findOwnerId).not.toHaveBeenCalled()
  })
})
