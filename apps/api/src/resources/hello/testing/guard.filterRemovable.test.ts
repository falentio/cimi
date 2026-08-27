import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixtures.ts'

describe('HelloGuard removal filtering', () => {
  it('does not permit a foreign owner to reach the delete repository call', async () => {
    const { service, repo } = createHelloFixture()
    repo.findOwnerId.mockResolvedValue('user_1')

    await expect(service.remove({ id: 'hello_1' }, { id: 'user_2' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    // oxlint-disable-next-line typescript/unbound-method -- Vitest matcher inspects the mock method
    expect(repo.deleteById).not.toHaveBeenCalled()
  })
})
