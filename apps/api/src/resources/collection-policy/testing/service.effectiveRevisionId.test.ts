import { describe, expect, it } from 'vitest'
import { createCollectionPolicyFixture, createPolicyLayers } from '../fixture.ts'

describe('CollectionPolicyService.effectiveRevisionId', () => {
  it('resolves the installation revision when the site has no override', async () => {
    const { repository, service } = createCollectionPolicyFixture()
    repository.loadLayers.mockResolvedValue(createPolicyLayers())

    await expect(service.effectiveRevisionId('ste_1')).resolves.toBe('cpr_installation_1')
    expect(repository.loadLayers).toHaveBeenCalledWith('ste_1')
  })

  it('prefers the site override revision, read through the same layer load the admission gate uses', async () => {
    const { repository, service } = createCollectionPolicyFixture()
    repository.loadLayers.mockResolvedValue(
      createPolicyLayers(undefined, createPolicyLayers().installation.values),
    )

    await expect(service.effectiveRevisionId('ste_1')).resolves.toBe('cpr_site_1')
    expect(repository.loadLayers).toHaveBeenCalledWith('ste_1')
  })
})
