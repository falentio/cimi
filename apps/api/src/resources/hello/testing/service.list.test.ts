import { describe, expect, it } from 'vitest'
import { createHelloFixture, createHello } from '../fixtures.ts'

describe('HelloService.list', () => {
  it('passes list defaults and the name filter to the repository', async () => {
    const { service, repo } = createHelloFixture()
    repo.findMany.mockResolvedValueOnce({
      items: [createHello()],
      nextOffset: null,
      hasMore: false,
      totalCount: 1,
    })

    await expect(service.list({ name: 'ad' })).resolves.toMatchObject({
      items: [{ id: 'hello_1' }],
      totalCount: 1,
    })
    // oxlint-disable-next-line typescript/unbound-method -- Vitest matcher inspects the mock method
    expect(repo.findMany).toHaveBeenCalledWith({ offset: 0, limit: 20, nameFilter: 'ad' })
  })
})
