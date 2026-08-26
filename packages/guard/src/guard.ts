import type { AuthUser } from '@cimi/auth'
import { ORPCError } from '@orpc/server'

export type AuthorizationLevel = 'public' | 'authenticated' | 'admin' | 'owner'

export interface AssertOptions {
  code?: 'FORBIDDEN' | 'NOT_FOUND'
}

export function assertIsAdmin(user: AuthUser | undefined, options?: AssertOptions): void {
  if (user?.role !== 'admin') {
    throw new ORPCError(options?.code ?? 'FORBIDDEN')
  }
}

export function assertAuthenticated(user: AuthUser | undefined): asserts user is AuthUser {
  if (user === undefined) throw new ORPCError('UNAUTHORIZED')
}

export function assertInstallationAdmin(user: AuthUser | undefined): void {
  assertAuthenticated(user)
  assertIsAdmin(user)
}

export function assertAuthorization(user: AuthUser | undefined, level: AuthorizationLevel): void {
  if (level === 'public') return
  if (level === 'authenticated') {
    assertAuthenticated(user)
    return
  }
  if (level === 'admin') {
    assertInstallationAdmin(user)
    return
  }
  assertAuthenticated(user)
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
