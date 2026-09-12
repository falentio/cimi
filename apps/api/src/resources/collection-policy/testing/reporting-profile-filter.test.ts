import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import { createSiteId } from '@cimi/kernel'
import { createCollectionPolicyFixture, createPolicyLayers } from '../fixture.ts'
import { CollectionPolicyReportingProfileFilter } from '../reporting-profile-filter.ts'

const siteId = createSiteId('ste_1')

describe('CollectionPolicyReportingProfileFilter', () => {
  it('returns the effective profileFilterKeys an installation policy resolves', async () => {
    const { repository, service } = createCollectionPolicyFixture()
    repository.loadLayers.mockResolvedValue(
      createPolicyLayers({
        ...schema.DEFAULT_COLLECTION_POLICY,
        profileFilterKeys: ['plan', 'tier'],
      }),
    )
    const port = new CollectionPolicyReportingProfileFilter({ collectionPolicy: service })

    await expect(port.getProfileFilterKeys(siteId)).resolves.toEqual(['plan', 'tier'])
  })

  it('returns the Site override keys over the installation default', async () => {
    const { repository, service } = createCollectionPolicyFixture()
    repository.loadLayers.mockResolvedValue(
      createPolicyLayers(
        { ...schema.DEFAULT_COLLECTION_POLICY, profileFilterKeys: ['installation_only'] },
        { ...schema.DEFAULT_COLLECTION_POLICY, profileFilterKeys: ['site_plan'] },
      ),
    )
    const port = new CollectionPolicyReportingProfileFilter({ collectionPolicy: service })

    await expect(port.getProfileFilterKeys(siteId)).resolves.toEqual(['site_plan'])
  })

  it('fails closed with no keys when no policy resolves for the Site', async () => {
    const { repository, service } = createCollectionPolicyFixture()
    repository.loadLayers.mockRejectedValue(new Error('NOT_FOUND'))
    const port = new CollectionPolicyReportingProfileFilter({ collectionPolicy: service })

    await expect(port.getProfileFilterKeys(siteId)).resolves.toEqual([])
  })
})
