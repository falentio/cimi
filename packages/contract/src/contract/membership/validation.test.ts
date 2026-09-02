import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  SMembershipChangeRoleInput,
  SMembershipChangeRoleOutput,
} from './command/change-member-role.ts'
import { SMembershipLeaveInput, SMembershipLeaveOutput } from './command/leave-organization.ts'
import { SMembershipRemoveInput, SMembershipRemoveOutput } from './command/remove-member.ts'
import {
  SMembershipTransferOwnershipInput,
  SMembershipTransferOwnershipOutput,
} from './command/transfer-ownership.ts'
import {
  SMembership,
  SMembershipMemberRole,
  SMembershipNonOwner,
  SMembershipOwner,
} from './schema.ts'
import { SMembershipListInput, SMembershipListOutput } from './query/list.ts'

const owner = {
  organizationId: 'organization-1',
  userId: 'user-1',
  role: 'owner',
  createdAt: '2026-08-23T00:00:00Z',
  updatedAt: '2026-08-23T00:00:00Z',
}

const member = {
  organizationId: 'organization-1',
  userId: 'user-2',
  role: 'member',
  createdAt: '2026-08-23T00:00:01Z',
  updatedAt: '2026-08-23T00:00:01Z',
}

const page = {
  items: [owner, member],
  nextOffset: null,
  hasMore: false,
  totalCount: 2,
}

describe('membership contract', () => {
  it('accepts valid member inputs and the supported non-owner roles', () => {
    expect(
      v.parse(SMembershipTransferOwnershipInput, {
        organizationId: 'organization-1',
        userId: 'user-2',
      }),
    ).toEqual({ organizationId: 'organization-1', userId: 'user-2' })
    expect(
      v.parse(SMembershipListInput, {
        organizationId: 'organization-1',
        offset: '2',
        limit: '10',
      }),
    ).toEqual({ organizationId: 'organization-1', offset: 2, limit: 10 })
    expect(
      v.parse(SMembershipChangeRoleInput, {
        organizationId: 'organization-1',
        userId: 'user-2',
        role: 'admin',
      }),
    ).toEqual({ organizationId: 'organization-1', userId: 'user-2', role: 'admin' })
    expect(v.parse(SMembershipLeaveInput, { organizationId: 'organization-1' })).toEqual({
      organizationId: 'organization-1',
    })
    expect(
      v.parse(SMembershipRemoveInput, {
        organizationId: 'organization-1',
        userId: 'user-2',
      }),
    ).toEqual({ organizationId: 'organization-1', userId: 'user-2' })
    expect(v.parse(SMembershipMemberRole, 'member')).toBe('member')
    expect(v.parse(SMembershipMemberRole, 'admin')).toBe('admin')
  })

  it('rejects invalid IDs, owner role changes, and unknown input keys', () => {
    expect(() =>
      v.parse(SMembershipTransferOwnershipInput, {
        organizationId: '',
        userId: 'user-2',
      }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SMembershipListInput, {
        organizationId: 'organization-1',
        limit: 101,
      }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SMembershipListInput, {
        organizationId: 'organization-1',
        unexpected: true,
      }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SMembershipChangeRoleInput, {
        organizationId: 'organization-1',
        userId: 'user-2',
        role: 'owner',
      }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SMembershipChangeRoleInput, {
        organizationId: 'organization-1',
        userId: 'user-2',
        role: 'moderator',
      }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SMembershipChangeRoleInput, {
        organizationId: 'organization-1',
        userId: 'user-2',
        role: 'member',
        extra: true,
      }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SMembershipLeaveInput, {
        organizationId: 'organization-1',
        userId: 'user-2',
      }),
    ).toThrow(v.ValiError)
  })

  it('returns complete role-specific and paginated membership shapes', () => {
    expect(v.parse(SMembership, owner)).toEqual(owner)
    expect(v.parse(SMembership, member)).toEqual(member)
    expect(v.parse(SMembershipOwner, owner)).toEqual(owner)
    expect(v.parse(SMembershipNonOwner, member)).toEqual(member)
    expect(v.parse(SMembershipChangeRoleOutput, { ...member, role: 'admin' })).toEqual({
      ...member,
      role: 'admin',
    })
    expect(v.parse(SMembershipTransferOwnershipOutput, owner)).toEqual(owner)
    expect(v.parse(SMembershipListOutput, page)).toEqual(page)
    expect(v.parse(SMembershipLeaveOutput, undefined)).toBeUndefined()
    expect(v.parse(SMembershipRemoveOutput, undefined)).toBeUndefined()
  })

  it('rejects malformed membership outputs and owner-sensitive output roles', () => {
    expect(() => v.parse(SMembership, { ...member, role: 'moderator' })).toThrow(v.ValiError)
    expect(() => v.parse(SMembership, { ...member, createdAt: 'not-a-date' })).toThrow(v.ValiError)
    expect(() => v.parse(SMembership, { ...member, extra: true })).toThrow(v.ValiError)
    expect(() => v.parse(SMembershipNonOwner, owner)).toThrow(v.ValiError)
    expect(() => v.parse(SMembershipOwner, member)).toThrow(v.ValiError)
    expect(() => v.parse(SMembershipChangeRoleOutput, { ...member, role: 'owner' })).toThrow(
      v.ValiError,
    )
    expect(() => v.parse(SMembershipTransferOwnershipOutput, member)).toThrow(v.ValiError)
    expect(() => v.parse(SMembershipListOutput, { ...page, totalCount: -1 })).toThrow(v.ValiError)
    expect(() => v.parse(SMembershipLeaveOutput, null)).toThrow(v.ValiError)
  })
})
