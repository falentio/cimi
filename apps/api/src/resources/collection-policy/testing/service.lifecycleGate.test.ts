import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import { createCollectionPolicyFixture, createTestAuthUser } from '../fixture.ts'

const admin = createTestAuthUser({ role: 'admin', installationGrant: true })
const policy = schema.DEFAULT_COLLECTION_POLICY

describe('CollectionPolicyService.lifecycleGate', () => {
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
})
