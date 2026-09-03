import { describe, expect, it } from 'vitest'
import type { HelloRepository } from '../repository.ts'
import { createHelloFixture, createHello } from '../fixture.ts'

describe('HelloService.create', () => {
  it('creates a greeting with generated identity and owner fields', async () => {
    const { service, repo } = createHelloFixture()
    repo.insert.mockResolvedValue(createHello())

    await service.create({ name: 'Ada', message: 'Hello, Ada!' }, 'user_1')

    expect(repo.insert).toHaveBeenCalledTimes(1)
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user_1',
        name: 'Ada',
        message: 'Hello, Ada!',
      }),
    )
    const record = repo.insert.mock.calls[0]?.[0] as HelloRepository.HelloRecord | undefined
    expect(record?.id).toMatch(/^hel_[a-z2-7]+$/)
    expect(record?.createdAt).toBeInstanceOf(Date)
  })
})
