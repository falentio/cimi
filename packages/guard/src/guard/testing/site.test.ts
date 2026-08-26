import type { AuthUser } from '@cimi/auth'
import { ORPCError } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { assertAuthorization } from '../../guard.ts'
import { assertSiteScope, InMemorySiteScopePort } from '../../site.ts'

const user = { id: 'user-1', role: 'user' } as unknown as AuthUser
const admin = { id: 'admin-1', role: 'admin' } as unknown as AuthUser

describe('authorization guards', () => {
  it('applies the coarse public, authenticated, and installation-admin levels', () => {
    expect(() => assertAuthorization(undefined, 'public')).not.toThrow()
    expect(() => assertAuthorization(undefined, 'authenticated')).toThrowError(ORPCError)
    expect(() => assertAuthorization(admin, 'admin')).not.toThrow()
    expect(() => assertAuthorization(user, 'admin')).toThrowError(ORPCError)
  })

  it('requires an active Site and persisted membership role', async () => {
    const scope = new InMemorySiteScopePort(
      [{ siteId: 'site-1', organizationId: 'org-1' }],
      [{ siteId: 'site-1', userId: 'user-1', role: 'member' }],
    )

    await expect(
      assertSiteScope(user, 'site-1', { siteScope: scope, membership: scope }),
    ).resolves.toBeUndefined()
    await expect(
      assertSiteScope(
        admin,
        'site-1',
        { siteScope: scope, membership: scope },
        { requiredRole: 'owner' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      assertSiteScope(user, 'missing', { siteScope: scope, membership: scope }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('fails closed for a non-active Site', async () => {
    const scope = new InMemorySiteScopePort([
      { siteId: 'site-1', organizationId: 'org-1', status: 'deleted' },
    ])

    await expect(
      assertSiteScope(user, 'site-1', { siteScope: scope, membership: scope }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
