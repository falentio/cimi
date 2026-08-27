import type { Db } from '@cimi/db'
import { HelloGuard } from './guard.ts'
import { HelloRepositoryDrizzle } from './repository.drizzle.ts'
import { helloRouter } from './router.ts'
import { HelloService } from './service.ts'

export { helloRouter }
export type { HelloApiContext } from './router.ts'
export { HelloGuard, type HelloGuardDependencies } from './guard.ts'
export { HelloService, type HelloServiceDependencies } from './service.ts'
export {
  HelloRepositoryDrizzle,
  type HelloRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { HelloRepository } from './repository.ts'

export interface CreateHelloDependencies {
  db: Db
}

export function createHello({ db }: CreateHelloDependencies) {
  const repository = new HelloRepositoryDrizzle({ db })
  const guard = new HelloGuard({ repository })
  const service = new HelloService({ repository, guard })
  const router = helloRouter(service)
  return { guard, service, router }
}

export type HelloModule = ReturnType<typeof createHello>
