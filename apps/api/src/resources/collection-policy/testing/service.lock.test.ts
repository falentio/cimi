import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import { createCollectionPolicyFixture, createTestAuthUser } from '../fixture.ts'

const admin = createTestAuthUser({ role: 'admin', installationGrant: true })
const policy = schema.DEFAULT_COLLECTION_POLICY

describe('CollectionPolicyService.lock', () => {
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
})
