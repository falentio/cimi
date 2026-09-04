import type { AuthUser } from '@cimi/auth'
import { ORPCError } from '@orpc/server'

export type AuthorizationLevel =
  | 'public'
  | 'authenticated'
  | 'admin'
  | 'owner'
  | 'installation-admin'

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
  if (user.installationGrant !== true) throw new ORPCError('FORBIDDEN')
}

export function assertAuthorization(user: AuthUser | undefined, level: AuthorizationLevel): void {
  switch (level) {
    case 'public':
      return
    case 'authenticated':
    case 'admin':
    case 'owner':
      return assertAuthenticated(user)
    case 'installation-admin':
      return assertInstallationAdmin(user)
    default:
      throw new ORPCError('FORBIDDEN')
  }
}

export function assertOwner(
  user: Pick<AuthUser, 'id'> | undefined,
  ownerId: string,
  options?: AssertOptions,
): void {
  if (user === undefined) throw new ORPCError('UNAUTHORIZED')
  if (user.id !== ownerId) {
    throw new ORPCError(options?.code ?? 'FORBIDDEN')
  }
}

export function assertOwnerOrAdmin(
  user: AuthUser | undefined,
  ownerId: string,
  options?: AssertOptions,
): void {
  assertAuthenticated(user)
  if (user.id !== ownerId && user.role !== 'admin') {
    throw new ORPCError(options?.code ?? 'FORBIDDEN')
  }
}
