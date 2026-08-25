import type { AuthUser } from '@cimi/auth'
import { schema } from '@cimi/contract'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import type { HelloService } from './service.ts'

export interface HelloApiContext {
  user: AuthUser | undefined
}

export function helloRouter(service: HelloService) {
  return {
    world: ({ input }: HelloHandlerOptions<InferOutput<typeof schema.SHelloWorldInput>>) =>
      service.world(input),
    get: ({ input }: HelloHandlerOptions<InferOutput<typeof schema.SHelloGetInput>>) =>
      service.get(input),
    list: ({ input }: HelloHandlerOptions<InferOutput<typeof schema.SHelloListInput>>) =>
      service.list(input),
    create: ({
      input,
      context,
    }: HelloHandlerOptions<InferOutput<typeof schema.SHelloCreateInput>>) =>
      service.create(input, requireUser(context.user).id),
    remove: ({
      input,
      context,
    }: HelloHandlerOptions<InferOutput<typeof schema.SHelloRemoveInput>>) =>
      service.remove(input, requireUser(context.user)),
  }
}

type HelloHandlerOptions<TInput> = {
  input: TInput
  context: HelloApiContext
}

function requireUser(user: AuthUser | undefined): AuthUser {
  if (user === undefined) throw new ORPCError('UNAUTHORIZED')
  return user
}
