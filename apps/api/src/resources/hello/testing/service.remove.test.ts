import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixtures.ts'

describe('HelloService.remove', () => {
  it('removes an owned greeting and hides missing or inaccessible records', async () => {
    const { service, deleteById } = createHelloFixture()

    await expect(service.remove({ id: 'hello_1' }, { id: 'user_1' })).resolves.toEqual({
      id: 'hello_1',
    })
    expect(deleteById).toHaveBeenCalledWith('hello_1', 'user_1')
    await expect(service.remove({ id: 'hello_1' }, { id: 'user_2' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(service.remove({ id: 'missing' }, { id: 'user_1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects a removal when the atomic delete observes no row', async () => {
    const { service, deleteById } = createHelloFixture()
    deleteById.mockResolvedValueOnce(false)

    await expect(service.remove({ id: 'hello_1' }, { id: 'user_1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
