import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixture.ts'

describe('HelloGuard.assertCanRemove', () => {
  it('allows the record owner and hides missing or foreign records', async () => {
    const { guard, repo } = createHelloFixture()
    repo.findOwnerId.mockImplementation(async (id) => (id === 'hello_1' ? 'user_1' : undefined))

    await expect(guard.assertCanRemove({ id: 'user_1' }, 'hello_1')).resolves.toBeUndefined()
    await expect(guard.assertCanRemove({ id: 'user_2' }, 'hello_1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(guard.assertCanRemove({ id: 'user_1' }, 'missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
