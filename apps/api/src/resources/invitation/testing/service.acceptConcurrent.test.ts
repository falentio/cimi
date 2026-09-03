import { describe, expect, it } from 'vitest'
import {
  createAuthorityMember,
  createInvitationFixture,
  createInvitationMembership,
  createInvitationRecord,
} from '../fixture.ts'
import { hashInvitationToken } from '../token.ts'

const token = 'shared-bearer-token'
const tokenHash = hashInvitationToken(token)

describe('InvitationService.accept concurrent', () => {
  it('lets exactly one of two different users win and compensates the loser', async () => {
    const build = () =>
      createInvitationFixture({
        memberships: [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
      })
    const first = build()
    const second = build()
    const record = createInvitationRecord({ role: 'member', tokenHash })
    let winner: string | undefined
    const consumeOnce = async (userId: string) => {
      if (winner === undefined) {
        winner = userId
        return {
          status: 'consumed',
          invitation: { ...record, status: 'accepted' },
          membership: createInvitationMembership({ userId, role: 'member' }),
        } as const
      }
      return { status: 'not-found' } as const
    }
    for (const fixture of [first, second]) {
      fixture.repository.findByTokenHash.mockResolvedValue(record)
      fixture.repository.consume.mockImplementation(async ({ userId }) => consumeOnce(userId))
      fixture.authority.getMember.mockResolvedValue(undefined)
    }

    const [firstResult, secondResult] = await Promise.allSettled([
      first.service.accept({ token }, { id: 'user_2' }, new Headers()),
      second.service.accept({ token }, { id: 'user_3' }, new Headers()),
    ])

    const fulfilled = [firstResult, secondResult].filter((result) => result.status === 'fulfilled')
    const rejected = [firstResult, secondResult].filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'NOT_FOUND' })
    const loser = firstResult.status === 'fulfilled' ? second : first
    expect(loser.authority.admitMember).toHaveBeenCalledOnce()
    expect(loser.authority.removeMember).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'authority_1' }),
    )
    expect((fulfilled[0] as PromiseFulfilledResult<{ userId: string }>).value.userId).toBe(winner)
    expect([
      createAuthorityMember({ userId: 'user_2' }),
      createAuthorityMember({ userId: 'user_3' }),
    ]).toHaveLength(2)
  })
})
