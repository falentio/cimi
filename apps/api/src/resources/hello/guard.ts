import type { AuthUser } from '@cimi/auth'
import { assertOwner } from '@cimi/guard'
import { ORPCError } from '@orpc/server'
import type { HelloRepository } from './repository.ts'

export interface HelloGuardDependencies {
  repository: HelloRepository
}

export class HelloGuard {
  private readonly repository: HelloRepository

  constructor({ repository }: HelloGuardDependencies) {
    this.repository = repository
  }

  async assertCanRemove(user: Pick<AuthUser, 'id'>, id: string): Promise<void> {
    const ownerId = await this.repository.findOwnerId(id)
    if (ownerId === undefined) throw new ORPCError('NOT_FOUND')
    assertOwner(user, ownerId, { code: 'NOT_FOUND' })
  }
}
