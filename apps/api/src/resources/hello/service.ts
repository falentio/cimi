import type { AuthUser } from '@cimi/auth'
import { schema } from '@cimi/contract'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import { HelloGuard } from './guard.ts'
import type { HelloRepository } from './repository.ts'

type HelloListInput = InferOutput<typeof schema.SHelloListInput>
type HelloGetInput = InferOutput<typeof schema.SHelloGetInput>
type HelloWorldInput = InferOutput<typeof schema.SHelloWorldInput>
type HelloCreateInput = InferOutput<typeof schema.SHelloCreateInput>
type HelloRemoveInput = InferOutput<typeof schema.SHelloRemoveInput>

export interface HelloServiceDependencies {
  repository: HelloRepository
  guard?: HelloGuard
}

export class HelloService {
  private readonly repository: HelloRepository
  private readonly guard: HelloGuard

  constructor({ repository, guard = new HelloGuard({ repository }) }: HelloServiceDependencies) {
    this.repository = repository
    this.guard = guard
  }

  world(input: HelloWorldInput): InferOutput<typeof schema.SHelloWorldOutput> {
    return { message: `Hello, ${input.name}!` }
  }

  async get(input: HelloGetInput): Promise<InferOutput<typeof schema.SHelloGetOutput>> {
    const hello = await this.repository.findById(input.id)
    if (hello === undefined) throw new ORPCError('NOT_FOUND')
    return hello
  }

  async list(input: HelloListInput): Promise<InferOutput<typeof schema.SHelloListOutput>> {
    const result = await this.repository.findMany({
      offset: input.offset ?? 0,
      limit: input.limit ?? 20,
      ...(input.name !== undefined && { nameFilter: input.name }),
    })
    return result
  }

  async create(
    input: HelloCreateInput,
    ownerId: AuthUser['id'],
  ): Promise<InferOutput<typeof schema.SHelloCreateOutput>> {
    return this.repository.insert({
      id: generateId('hel'),
      ownerId,
      name: input.name,
      message: input.message,
      createdAt: new Date(),
    })
  }

  async remove(
    input: HelloRemoveInput,
    user: Pick<AuthUser, 'id'>,
  ): Promise<InferOutput<typeof schema.SHelloRemoveOutput>> {
    await this.guard.assertCanRemove(user, input.id)
    const deleted = await this.repository.deleteById(input.id, user.id)
    if (!deleted) throw new ORPCError('NOT_FOUND')
    return { id: input.id }
  }
}
