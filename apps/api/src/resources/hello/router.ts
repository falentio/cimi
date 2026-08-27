import type { AuthUser } from '@cimi/auth'
import { contract } from '@cimi/contract'
import { assertAuthenticated } from '@cimi/guard'
import { implement } from '@orpc/server'
import type { HelloService } from './service.ts'

export interface HelloApiContext {
  user: AuthUser | undefined
}

export function helloRouter(service: HelloService) {
  const api = implement(contract.hello).$context<HelloApiContext>()

  return api.router({
    world: api.world.handler(({ input }) => service.world(input)),
    get: api.get.handler(({ input }) => service.get(input)),
    list: api.list.handler(({ input }) => service.list(input)),
    create: api.create.handler(({ input, context }) => {
      assertAuthenticated(context.user)
      return service.create(input, context.user.id)
    }),
    remove: api.remove.handler(({ input, context }) => {
      assertAuthenticated(context.user)
      return service.remove(input, context.user)
    }),
  })
}
