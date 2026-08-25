import type { AuthUser } from '@cimi/auth'
import { assertOwner } from '@cimi/guard'
import { ORPCError } from '@orpc/server'
import type { HelloRepository } from './repository.ts'

export class HelloGuard {
  constructor(private readonly repo: HelloRepository) {}

  async assertCanRemove(user: Pick<AuthUser, 'id'>, id: string): Promise<void> {
    const ownerId = await this.repo.findOwnerId(id)
    if (ownerId === undefined) throw new ORPCError('NOT_FOUND')
    assertOwner(user, ownerId, { code: 'NOT_FOUND' })
  }
}
