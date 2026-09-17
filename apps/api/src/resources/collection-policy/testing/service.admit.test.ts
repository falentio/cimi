import { describe, expect, it } from 'vitest'
import { createCollectionPolicyFixture, createPolicyLayers } from '../fixture.ts'

describe('CollectionPolicyService.admit', () => {
  it('exposes admission decisions for later ingestion callers', async () => {
    const now = new Date('2026-09-05T00:00:00.000Z')
    const { repository, service } = createCollectionPolicyFixture({ clock: () => now })
    repository.loadLayers.mockResolvedValue(createPolicyLayers())

    const decision = await service.admit({ siteId: 'ste_1', path: '/home' })

    expect(decision.revision).toEqual({
      id: 'cpr_installation_1',
      version: 1,
      target: { scope: 'installation' },
    })
    expect(decision.evaluatedAt).toBe(now.toISOString())
    expect(decision.outcome.kind).toBe('accepted')
  })

  it('rejects admission for inactive Sites before reading policy', async () => {
    const { repository, service } = createCollectionPolicyFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'deleted' }],
    })

    await expect(service.admit({ siteId: 'ste_1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.loadLayers).not.toHaveBeenCalled()
  })
})
