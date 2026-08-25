import { describe, expect, it } from 'vitest'
import { createHelloFixture, createHello } from '../fixtures.ts'

describe('HelloService.list', () => {
  it('passes list defaults and the name filter to the repository', async () => {
    const { service, findMany } = createHelloFixture()
    findMany.mockResolvedValueOnce({
      items: [createHello()],
      nextOffset: null,
      hasMore: false,
      totalCount: 1,
    })

    await expect(service.list({ name: 'ad' })).resolves.toMatchObject({
      items: [{ id: 'hello_1' }],
      totalCount: 1,
    })
    expect(findMany).toHaveBeenCalledWith({ offset: 0, limit: 20, nameFilter: 'ad' })
  })
})
