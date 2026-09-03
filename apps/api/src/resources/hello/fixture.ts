import { mock } from 'vitest-mock-extended'
import { HelloGuard } from './guard.ts'
import type { HelloRepository } from './repository.ts'
import { HelloService } from './service.ts'

const createdAt = '2026-08-25T00:00:00.000Z'

export function createHelloFixture() {
  const repo = mock<HelloRepository>()
  const guard = new HelloGuard({ repository: repo })
  const service = new HelloService({ repository: repo, guard })
  return { repo, guard, service }
}

export function createHello(overrides: Partial<HelloRepository.Hello> = {}): HelloRepository.Hello {
  return {
    id: 'hello_1',
    ownerId: 'user_1',
    name: 'Ada',
    message: 'Hello, Ada!',
    createdAt,
    ...overrides,
  }
}
