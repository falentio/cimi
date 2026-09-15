import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import {
  createCollectionPolicyFixture,
  createPolicyLayers,
  createTestAuthUser,
} from '../fixture.ts'

const owner = createTestAuthUser({ role: 'member' })
const policy = schema.DEFAULT_COLLECTION_POLICY

describe('CollectionPolicyService.get', () => {
  it('returns a Site-scoped effective policy with exactly nine provenance entries', async () => {
    const { repository, service } = createCollectionPolicyFixture()
    repository.loadLayers.mockResolvedValue(createPolicyLayers())

    const result = await service.get({ siteId: 'ste_1' }, owner)

    expect(result).toEqual({
      installationDefault: { scope: 'installation', ...policy },
      siteOverride: null,
      effective: { scope: 'site', siteId: 'ste_1', ...policy },
      source: {
        anonymousCollection: 'installation',
        honorGpcDnt: 'installation',
        consentMode: 'installation',
        botPolicy: 'installation',
        captureQueryStrings: 'installation',
        urlPolicy: 'installation',
        propertyPolicy: 'installation',
        profileFilterKeys: 'installation',
        exclusions: 'installation',
      },
    })
  })
})
