import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixtures.ts'

describe('HelloService.world', () => {
  it('computes a personalized greeting without using the repository', () => {
    const { service, findById, findMany } = createHelloFixture()

    expect(service.world({ name: 'Ada' })).toEqual({ message: 'Hello, Ada!' })
    expect(findById).not.toHaveBeenCalled()
    expect(findMany).not.toHaveBeenCalled()
  })
})
