import { describe, expect, it } from 'vitest'
import { createInvitationFixture } from '../fixture.ts'

const input = { organizationId: 'org_1', role: 'member' } as const

describe('InvitationService.createLimit', () => {
  it('maps a reached limit to INVITATION_LIMIT_REACHED', async () => {
    const { repository, service } = createInvitationFixture()
    repository.insert.mockResolvedValue({ status: 'limit-reached' })

    await expect(service.create(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'INVITATION_LIMIT_REACHED',
    })
  })

  it('returns no invitation or token when the limit is reached', async () => {
    const { repository, service } = createInvitationFixture()
    repository.insert.mockResolvedValue({ status: 'limit-reached' })

    let thrown: Error | undefined

    try {
      await service.create(input, { id: 'user_1' }, new Headers())
    } catch (error) {
      if (!(error instanceof Error)) throw error
      thrown = error
    }

    expect(thrown).toBeDefined()
    expect(thrown).not.toHaveProperty('token')
    expect(thrown).not.toHaveProperty('invitation')
  })
})
