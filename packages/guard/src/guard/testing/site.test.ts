import type { AuthUser } from '@cimi/auth'
import { ORPCError } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { assertAuthorization } from '../../guard.ts'
import { assertSiteScope, InMemorySiteScopePort } from '../../site.ts'

const user = { id: 'user-1', role: 'user' } as unknown as AuthUser
const organizationAdmin = { id: 'admin-1', role: 'user' } as unknown as AuthUser
const nonMember = { id: 'stranger-1', role: 'user' } as unknown as AuthUser

describe('authorization guards', () => {
  it('applies coarse admission and installation-admin levels separately', () => {
    expect(() => assertAuthorization(undefined, 'public')).not.toThrow()
    expect(() => assertAuthorization(undefined, 'authenticated')).toThrowError(ORPCError)
    expect(() => assertAuthorization(user, 'admin')).not.toThrow()
  })

  it('requires an active Site and persisted membership role', async () => {
    const scope = new InMemorySiteScopePort(
      [{ siteId: 'ste-1', organizationId: 'org-1' }],
      [
        { organizationId: 'org-1', userId: 'user-1', role: 'member' },
        { organizationId: 'org-1', userId: 'admin-1', role: 'member' },
      ],
    )

    await expect(
      assertSiteScope(user, 'ste-1', { siteScope: scope, membership: scope }),
    ).resolves.toBeUndefined()
    await expect(
      assertSiteScope(
        organizationAdmin,
        'ste-1',
        { siteScope: scope, membership: scope },
        { requiredRole: 'owner' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      assertSiteScope(nonMember, 'ste-1', {
        siteScope: scope,
        membership: scope,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      assertSiteScope(user, 'missing', { siteScope: scope, membership: scope }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('revokes Site access when Organization membership is removed', async () => {
    const scope = new InMemorySiteScopePort(
      [{ siteId: 'ste-1', organizationId: 'org-1' }],
      [{ organizationId: 'org-1', userId: 'user-1', role: 'member' }],
    )

    scope.revokeMembership('org-1', 'user-1')

    await expect(
      assertSiteScope(user, 'ste-1', { siteScope: scope, membership: scope }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('does not reuse membership from another Organization', async () => {
    const scope = new InMemorySiteScopePort(
      [
        { siteId: 'ste-1', organizationId: 'org-1' },
        { siteId: 'ste-2', organizationId: 'org-2' },
      ],
      [{ organizationId: 'org-1', userId: 'user-1', role: 'member' }],
    )

    await expect(
      assertSiteScope(user, 'ste-1', { siteScope: scope, membership: scope }),
    ).resolves.toBeUndefined()
    await expect(
      assertSiteScope(user, 'ste-2', { siteScope: scope, membership: scope }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('fails closed for a non-active Site', async () => {
    const scope = new InMemorySiteScopePort([
      { siteId: 'ste-1', organizationId: 'org-1', status: 'deleted' },
    ])

    await expect(
      assertSiteScope(user, 'ste-1', { siteScope: scope, membership: scope }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('does not disclose an active Site with no accessible Organization scope', async () => {
    const siteScope = {
      exists: () => true,
      isActive: () => true,
      getOrganizationId: () => undefined,
    }
    const membership = {
      getRole: () => 'member' as const,
      hasPendingGovernanceOperation: () => false,
    }

    await expect(assertSiteScope(user, 'ste-1', { siteScope, membership })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
