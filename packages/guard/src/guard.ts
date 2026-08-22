import type { AuthUser } from '@cimi/auth'
import { ORPCError } from '@orpc/server'

export interface AssertOptions {
  code?: 'FORBIDDEN' | 'NOT_FOUND'
}

export function assertIsAdmin(user: AuthUser | undefined, options?: AssertOptions): void {
  if (user?.role !== 'admin') {
    throw new ORPCError(options?.code ?? 'FORBIDDEN')
  }
}

export function assertOwner(
  user: Pick<AuthUser, 'id'>,
  ownerId: string,
  options?: AssertOptions,
): void {
  if (user.id !== ownerId) {
    throw new ORPCError(options?.code ?? 'FORBIDDEN')
  }
}

export function assertOwnerOrAdmin(
  user: AuthUser | undefined,
  ownerId: string,
  options?: AssertOptions,
): void {
  if (user?.id !== ownerId && user?.role !== 'admin') {
    throw new ORPCError(options?.code ?? 'FORBIDDEN')
  }
}
