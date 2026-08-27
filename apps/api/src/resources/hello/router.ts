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
  const authenticated = api.use(({ context, next }) => {
    assertAuthenticated(context.user)
    return next({ context: { user: context.user } })
  })

  return api.router({
    world: api.world.handler(({ input }) => service.world(input)),
    get: api.get.handler(({ input }) => service.get(input)),
    list: api.list.handler(({ input }) => service.list(input)),
    create: authenticated.create.handler(({ input, context }) =>
      service.create(input, context.user.id),
    ),
    remove: authenticated.remove.handler(({ input, context }) =>
      service.remove(input, context.user),
    ),
  })
}
