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

export class HelloService {
  constructor(
    private readonly repo: HelloRepository,
    private readonly guard: HelloGuard = new HelloGuard(repo),
  ) {}

  world(input: HelloWorldInput): InferOutput<typeof schema.SHelloWorldOutput> {
    return { message: `Hello, ${input.name}!` }
  }

  async get(input: HelloGetInput): Promise<InferOutput<typeof schema.SHelloGetOutput>> {
    const hello = await this.repo.findById(input.id)
    if (hello === undefined) throw new ORPCError('NOT_FOUND')
    return hello
  }

  async list(input: HelloListInput): Promise<InferOutput<typeof schema.SHelloListOutput>> {
    const result = await this.repo.findMany({
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
    return this.repo.insert({
      id: generateId('hello'),
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
    const deleted = await this.repo.deleteById(input.id, user.id)
    if (!deleted) throw new ORPCError('NOT_FOUND')
    return { id: input.id }
  }
}
