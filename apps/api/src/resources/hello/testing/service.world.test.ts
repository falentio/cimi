import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixtures.ts'

describe('HelloService.world', () => {
  it('computes a personalized greeting without using the repository', () => {
    const { service, repo } = createHelloFixture()

    expect(service.world({ name: 'Ada' })).toEqual({ message: 'Hello, Ada!' })
    expect(repo.findById).not.toHaveBeenCalled()
    expect(repo.findMany).not.toHaveBeenCalled()
  })
})
