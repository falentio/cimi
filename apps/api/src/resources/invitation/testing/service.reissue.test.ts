import { describe, expect, it } from 'vitest'
import { hashInvitationToken } from '../token.ts'
import { createInvitationFixture } from '../fixture.ts'

const input = { organizationId: 'org_1', role: 'member' } as const

describe('InvitationService.reissue', () => {
  it('creates a new invitation with distinct tokens on reissue', async () => {
    const { repository, service } = createInvitationFixture()
    repository.insert.mockImplementation(async (createInput) => ({
      id: createInput.id,
      organizationId: createInput.organizationId,
      role: createInput.role,
      tokenHash: createInput.tokenHash,
      expiresAt: createInput.expiresAt,
      status: 'pending',
      acceptedAt: null,
      revokedAt: null,
      createdAt: createInput.createdAt,
      updatedAt: createInput.updatedAt,
    }))

    const first = await service.create(input, { id: 'user_1' }, new Headers())
    const second = await service.create(input, { id: 'user_1' }, new Headers())

    expect(second.token).not.toBe(first.token)
    expect(repository.insert).toHaveBeenCalledTimes(2)
    const firstStored = repository.insert.mock.calls[0]?.[0]
    const secondStored = repository.insert.mock.calls[1]?.[0]
    expect(firstStored?.tokenHash).toBe(hashInvitationToken(first.token))
    expect(secondStored?.tokenHash).toBe(hashInvitationToken(second.token))
    expect(secondStored?.tokenHash).not.toBe(firstStored?.tokenHash)
    expect(JSON.stringify(second)).not.toContain(secondStored?.tokenHash)
  })
})
