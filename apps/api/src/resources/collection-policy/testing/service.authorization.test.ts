import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import { createCollectionPolicyFixture, createTestAuthUser } from '../fixture.ts'

const member = createTestAuthUser({ id: 'user_2', role: 'member' })
const policy = schema.DEFAULT_COLLECTION_POLICY

describe('CollectionPolicyService.authorization', () => {
  it('enforces installation and Site authorization before repository access', async () => {
    const { repository, service } = createCollectionPolicyFixture({
      memberships: [
        { organizationId: 'org_1', userId: 'user_1', role: 'owner' },
        { organizationId: 'org_1', userId: 'user_2', role: 'member' },
      ],
    })

    await expect(service.update({ scope: 'installation', policy }, member)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(service.get({ siteId: 'ste_1' }, member)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(repository.commitRevision).not.toHaveBeenCalled()
    expect(repository.loadLayers).not.toHaveBeenCalled()
  })
})
