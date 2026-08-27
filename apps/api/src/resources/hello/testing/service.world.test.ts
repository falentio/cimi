import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixtures.ts'

describe('HelloService.world', () => {
  it('computes a personalized greeting without using the repository', () => {
    const { service, repo } = createHelloFixture()

    expect(service.world({ name: 'Ada' })).toEqual({ message: 'Hello, Ada!' })
    // oxlint-disable-next-line typescript/unbound-method -- Vitest matcher inspects the mock method
    expect(repo.findById).not.toHaveBeenCalled()
    // oxlint-disable-next-line typescript/unbound-method -- Vitest matcher inspects the mock method
    expect(repo.findMany).not.toHaveBeenCalled()
  })
})
