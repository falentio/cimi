import type { AuthUser } from '@cimi/auth'
import { ORPCError } from '@orpc/server'

type PortResult<T> = T | PromiseLike<T>

export interface SiteScopePort {
  exists(siteId: string): PortResult<boolean>
  isActive(siteId: string): PortResult<boolean>
  getOrganizationId(siteId: string): PortResult<string | undefined>
}

export type SiteMembershipRole = 'owner' | 'admin' | 'member'

export interface SiteMembershipPort {
  getRole(organizationId: string, userId: string): PortResult<SiteMembershipRole | undefined>
}

export interface SiteScopeGuardDependencies {
  readonly siteScope: SiteScopePort
  readonly membership: SiteMembershipPort
}

export interface SiteScopeGuardOptions {
  readonly requiredRole?: SiteMembershipRole
  readonly missingSiteCode?: 'NOT_FOUND' | 'FORBIDDEN'
}

export async function assertSiteScope(
  user: AuthUser | undefined,
  siteId: string,
  dependencies: SiteScopeGuardDependencies,
  options: SiteScopeGuardOptions = {},
): Promise<void> {
  assertAuthenticated(user)

  const siteExists = await dependencies.siteScope.exists(siteId)
  const siteIsActive = siteExists && (await dependencies.siteScope.isActive(siteId))
  const organizationId = siteExists
    ? await dependencies.siteScope.getOrganizationId(siteId)
    : undefined
  if (!siteExists || !siteIsActive || organizationId === undefined) {
    throw new ORPCError(options.missingSiteCode ?? 'NOT_FOUND')
  }

  const role = await dependencies.membership.getRole(organizationId, user.id)
  if (role === undefined) {
    throw new ORPCError('NOT_FOUND')
  }
  if (!hasRequiredRole(role, options.requiredRole ?? 'member')) {
    throw new ORPCError('FORBIDDEN')
  }
}

export class InMemorySiteScopePort implements SiteScopePort, SiteMembershipPort {
  readonly #sites = new Map<string, { organizationId: string; active: boolean }>()
  readonly #memberships = new Map<string, SiteMembershipRole>()

  constructor(
    sites: ReadonlyArray<InMemorySiteRecord> = [],
    memberships: ReadonlyArray<InMemorySiteMembership> = [],
  ) {
    for (const site of sites) this.setSite(site)
    for (const membership of memberships) this.setMembership(membership)
  }

  setSite(site: InMemorySiteRecord): void {
    this.#sites.set(site.siteId, {
      organizationId: site.organizationId,
      active: site.status === undefined || site.status === 'active',
    })
  }

  setMembership(membership: InMemorySiteMembership): void {
    this.#memberships.set(
      membershipKey(membership.organizationId, membership.userId),
      membership.role,
    )
  }

  revokeMembership(organizationId: string, userId: string): void {
    this.#memberships.delete(membershipKey(organizationId, userId))
  }

  exists(siteId: string): boolean {
    return this.#sites.has(siteId)
  }

  isActive(siteId: string): boolean {
    return this.#sites.get(siteId)?.active ?? false
  }

  getOrganizationId(siteId: string): string | undefined {
    return this.#sites.get(siteId)?.organizationId
  }

  getRole(organizationId: string, userId: string): SiteMembershipRole | undefined {
    return this.#memberships.get(membershipKey(organizationId, userId))
  }
}

export interface InMemorySiteRecord {
  readonly siteId: string
  readonly organizationId: string
  readonly status?: 'active' | 'deleting' | 'deleted' | 'recovering' | 'purged'
}

export interface InMemorySiteMembership {
  readonly organizationId: string
  readonly userId: string
  readonly role: SiteMembershipRole
}

function assertAuthenticated(user: AuthUser | undefined): asserts user is AuthUser {
  if (user === undefined) throw new ORPCError('UNAUTHORIZED')
}

function hasRequiredRole(
  actual: SiteMembershipRole | undefined,
  required: SiteMembershipRole,
): boolean {
  if (actual === undefined) return false
  const rank: Record<SiteMembershipRole, number> = { member: 1, admin: 2, owner: 3 }
  return rank[actual] >= rank[required]
}

function membershipKey(organizationId: string, userId: string): string {
  return `${organizationId}\u0000${userId}`
}
