import { api, authenticatedApi } from '../../orpc.ts'
import type { HelloService } from './service.ts'

const helloApi = api.hello
const authenticatedHelloApi = authenticatedApi.hello

export function helloRouter(service: HelloService) {
  return helloApi.router({
    world: helloApi.world.handler(({ input }) => service.world(input)),
    get: helloApi.get.handler(({ input }) => service.get(input)),
    list: helloApi.list.handler(({ input }) => service.list(input)),
    create: authenticatedHelloApi.create.handler(({ input, context }) =>
      service.create(input, context.user.id),
    ),
    remove: authenticatedHelloApi.remove.handler(({ input, context }) =>
      service.remove(input, context.user),
    ),
  })
}
