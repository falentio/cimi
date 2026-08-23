import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SInvitationAcceptOutput } from './command/accept.ts'

describe('invitation acceptance contract', () => {
  it('returns the complete resulting membership', () => {
    const membership = {
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'member',
      createdAt: '2026-08-23T00:00:00Z',
      updatedAt: '2026-08-23T00:00:00Z',
    }

    expect(v.parse(SInvitationAcceptOutput, membership)).toEqual(membership)
  })

  it('rejects a partial membership response', () => {
    expect(() =>
      v.parse(SInvitationAcceptOutput, {
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'member',
      }),
    ).toThrow(v.ValiError)
  })
})
