import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SInvitationAcceptInput, SInvitationAcceptOutput } from './command/accept.ts'

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

  it('rejects an Owner membership response', () => {
    expect({
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'owner',
      createdAt: '2026-08-23T00:00:00Z',
      updatedAt: '2026-08-23T00:00:00Z',
    }).not.toEqual(expect.schemaMatching(SInvitationAcceptOutput))
  })

  it('keeps acceptance token-only without an email binding', () => {
    expect(v.parse(SInvitationAcceptInput, { token: 'bearer-token' })).toEqual({
      token: 'bearer-token',
    })
    expect({ token: 'bearer-token', email: 'user@example.com' }).not.toEqual(
      expect.schemaMatching(SInvitationAcceptInput),
    )
  })
})
