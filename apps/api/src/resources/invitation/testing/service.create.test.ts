import { describe, expect, it } from 'vitest'
import { hashInvitationToken } from '../token.ts'
import { createInvitationFixture } from '../fixture.ts'

const input = { organizationId: 'org_1', role: 'member' } as const

describe('InvitationService.create', () => {
  it('returns the token once and stores only its hash', async () => {
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

    const result = await service.create(input, { id: 'user_1' }, new Headers())

    expect(result.token).toEqual(expect.any(String))
    expect(result.invitation).not.toHaveProperty('tokenHash')
    expect(result.invitation).toMatchObject({
      organizationId: 'org_1',
      role: 'member',
      status: 'pending',
    })
    expect(repository.insert).toHaveBeenCalledOnce()
    const stored = repository.insert.mock.calls[0]?.[0]
    expect(stored).toMatchObject({ organizationId: 'org_1', role: 'member' })
    expect(stored?.tokenHash).toBe(hashInvitationToken(result.token))
    expect(JSON.stringify(result)).not.toContain(stored?.tokenHash)
  })

  it('rejects a member without the admin role', async () => {
    const { repository, service } = createInvitationFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_1', role: 'member' }],
    })

    await expect(service.create(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('rejects an outsider as not found', async () => {
    const { repository, service } = createInvitationFixture()

    await expect(
      service.create(input, { id: 'user_missing' }, new Headers()),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('rejects creation while a governance operation is pending', async () => {
    const { repository, scope, service } = createInvitationFixture()
    scope.setPendingGovernanceOperation('org_1')

    await expect(service.create(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('maps a token hash conflict to a conflict error', async () => {
    const { repository, service } = createInvitationFixture()
    repository.insert.mockRejectedValue(
      new Error('UNIQUE constraint failed: invitation.token_hash'),
    )

    await expect(service.create(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})
