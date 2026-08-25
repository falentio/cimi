import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixtures.ts'

describe('HelloService.get', () => {
  it('returns a greeting by id and rejects missing records', async () => {
    const { service } = createHelloFixture()

    await expect(service.get({ id: 'hello_1' })).resolves.toEqual({
      id: 'hello_1',
      ownerId: 'user_1',
      name: 'Ada',
      message: 'Hello, Ada!',
      createdAt: '2026-08-25T00:00:00.000Z',
    })
    await expect(service.get({ id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
