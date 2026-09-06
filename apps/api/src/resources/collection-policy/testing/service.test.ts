import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import {
  createCollectionPolicyFixture,
  createPolicyLayers,
  createTestAuthUser,
} from '../fixture.ts'

const admin = createTestAuthUser({ role: 'admin', installationGrant: true })
const owner = createTestAuthUser({ role: 'member' })
const member = createTestAuthUser({ id: 'user_2', role: 'member' })
const policy = schema.DEFAULT_COLLECTION_POLICY

describe('CollectionPolicyService', () => {
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

  it('uses the distinct transient collection policy lock and releases it on failure', async () => {
    const { repository, lock, service } = createCollectionPolicyFixture()
    const held = lock.acquire('collection_policy')
    expect(held).toBeDefined()
    await expect(service.update({ scope: 'installation', policy }, admin)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    if (held !== undefined) await held.release()

    repository.commitRevision.mockRejectedValueOnce(new Error('boom'))
    await expect(service.update({ scope: 'installation', policy }, admin)).rejects.toThrow('boom')
    const retry = lock.acquire('collection_policy')
    expect(retry).toBeDefined()
    if (retry !== undefined) await retry.release()
  })

  it('rejects updates during nonterminal lifecycle operations but allows terminal ones', async () => {
    const activeOperation = {
      operationId: 'bop_1',
      kind: 'upgrade' as const,
      phase: 'pre_upgrade_safety' as const,
      checkpoint: 'none' as const,
      progress: null,
      lastSafeSequence: null,
      errorCode: null,
    }
    const { lifecycle, repository, service } = createCollectionPolicyFixture({ activeOperation })

    await expect(service.update({ scope: 'installation', policy }, admin)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(repository.commitRevision).not.toHaveBeenCalled()

    lifecycle.setActiveOperation({ ...activeOperation, errorCode: 'CONFLICT' })
    await expect(service.update({ scope: 'installation', policy }, admin)).resolves.toEqual({
      scope: 'installation',
      ...policy,
    })
  })

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

  it('serializes admission with policy changes and lifecycle transitions', async () => {
    const { lock, service } = createCollectionPolicyFixture()
    const held = lock.acquire('collection_policy')
    expect(held).toBeDefined()

    await expect(service.admit({ siteId: 'ste_1' })).rejects.toMatchObject({ code: 'CONFLICT' })
    if (held !== undefined) await held.release()

    const { service: lifecycleService } = createCollectionPolicyFixture({
      activeOperation: {
        operationId: 'sop_1',
        kind: 'site_deletion',
        phase: 'site_transition',
        checkpoint: 'none',
        progress: null,
        lastSafeSequence: null,
        errorCode: null,
      },
    })
    await expect(lifecycleService.admit({ siteId: 'ste_1' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('rejects admission for inactive Sites before reading policy', async () => {
    const { repository, service } = createCollectionPolicyFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'deleted' }],
    })

    await expect(service.admit({ siteId: 'ste_1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.loadLayers).not.toHaveBeenCalled()
  })
})
