import { describe, expect, it } from 'vitest'
import type { HelloRepository } from '../repository.ts'
import { createHelloFixture } from '../fixtures.ts'

describe('HelloService.create', () => {
  it('creates a greeting with generated identity and owner fields', async () => {
    const { service, insert } = createHelloFixture()

    await service.create({ name: 'Ada', message: 'Hello, Ada!' }, 'user_1')

    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user_1',
        name: 'Ada',
        message: 'Hello, Ada!',
      }),
    )
    const record = insert.mock.calls[0]?.[0] as HelloRepository.HelloRecord | undefined
    expect(record?.id).toMatch(/^hello_[a-z2-7]+$/)
    expect(record?.createdAt).toBeInstanceOf(Date)
  })
})
