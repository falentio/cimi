import type { Db } from '@cimi/db'
import { HelloGuard } from './guard.ts'
import { HelloRepositoryDrizzle } from './repository.drizzle.ts'
import { HelloService } from './service.ts'

export { helloRouter } from './router.ts'
export type { HelloApiContext } from './router.ts'
export { HelloGuard } from './guard.ts'
export { HelloService } from './service.ts'
export { HelloRepositoryDrizzle } from './repository.drizzle.ts'
export type { HelloRepository } from './repository.ts'

export interface CreateHelloDependencies {
  db: Db
}

export function createHello({ db }: CreateHelloDependencies) {
  const repository = new HelloRepositoryDrizzle(db)
  const guard = new HelloGuard(repository)
  const service = new HelloService(repository, guard)
  return { guard, service }
}

export type HelloModule = ReturnType<typeof createHello>
