import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import { createCollectionPolicyFixture, createTestAuthUser } from '../fixture.ts'

const owner = createTestAuthUser({ role: 'member' })
const policy = schema.DEFAULT_COLLECTION_POLICY

describe('CollectionPolicyService.inactiveSite', () => {
  it('preserves Site guard outcomes for inactive Sites', async () => {
    const { repository, service } = createCollectionPolicyFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'deleting' }],
    })

    await expect(service.get({ siteId: 'ste_1' }, owner)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      service.update({ scope: 'site', policy: { ...policy, siteId: 'ste_1' } }, owner),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.loadLayers).not.toHaveBeenCalled()
    expect(repository.commitRevision).not.toHaveBeenCalled()
  })
})
