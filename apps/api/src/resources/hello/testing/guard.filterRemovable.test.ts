import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixtures.ts'

describe('HelloGuard removal filtering', () => {
  it('does not permit a foreign owner to reach the delete repository call', async () => {
    const { service, deleteById } = createHelloFixture()

    await expect(service.remove({ id: 'hello_1' }, { id: 'user_2' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(deleteById).not.toHaveBeenCalled()
  })
})
