import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import { createCollectionPolicyFixture, createTestAuthUser } from '../fixture.ts'

const admin = createTestAuthUser({ role: 'admin', installationGrant: true })
const owner = createTestAuthUser({ role: 'member' })
const policy = schema.DEFAULT_COLLECTION_POLICY

describe('CollectionPolicyService.update', () => {
  it('returns a mutation without fabricating a Site ID for installation updates', async () => {
    const now = new Date('2026-09-05T00:00:00.000Z')
    const { repository, service } = createCollectionPolicyFixture({ clock: () => now })

    const result = await service.update({ scope: 'installation', policy }, admin)

    expect(result).toEqual({ scope: 'installation', ...policy })
    expect(result).not.toHaveProperty('siteId')
    expect(repository.commitRevision).toHaveBeenCalledWith({
      target: { scope: 'installation' },
      values: policy,
      revisionId: 'cpr_fixed',
      changedBy: 'user_1',
      now,
    })
  })

  it('maps a Site mutation to the Site target', async () => {
    const { repository, service } = createCollectionPolicyFixture()
    const sitePolicy = { ...policy, siteId: 'ste_1' }

    await expect(service.update({ scope: 'site', policy: sitePolicy }, owner)).resolves.toEqual({
      scope: 'site',
      ...sitePolicy,
    })
    expect(repository.commitRevision).toHaveBeenCalledWith(
      expect.objectContaining({ target: { scope: 'site', siteId: 'ste_1' } }),
    )
  })

  it('clears a Site override and returns the inherited effective policy', async () => {
    const { repository, service } = createCollectionPolicyFixture()

    await expect(
      service.update({ scope: 'site', policy: { siteId: 'ste_1', clear: true } }, owner),
    ).resolves.toEqual({ scope: 'site', siteId: 'ste_1', ...policy })
    expect(repository.commitRevision).toHaveBeenCalledWith(
      expect.objectContaining({ target: { scope: 'site', siteId: 'ste_1' }, values: null }),
    )
  })
})
