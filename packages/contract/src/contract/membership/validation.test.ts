import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  SMembershipTransferOwnershipInput,
  SMembershipTransferOwnershipOutput,
} from './command/transfer-ownership.ts'

describe('membership ownership transfer contract', () => {
  it('targets one Organization member', () => {
    expect(
      v.parse(SMembershipTransferOwnershipInput, {
        organizationId: 'org-1',
        userId: 'user-2',
      }),
    ).toEqual({ organizationId: 'org-1', userId: 'user-2' })
  })

  it('returns the promoted Owner membership', () => {
    const membership = {
      organizationId: 'org-1',
      userId: 'user-2',
      role: 'owner',
      createdAt: '2026-08-23T00:00:00Z',
      updatedAt: '2026-08-23T00:00:00Z',
    }

    expect(v.parse(SMembershipTransferOwnershipOutput, membership)).toEqual(membership)
    expect(
      v.safeParse(SMembershipTransferOwnershipOutput, { ...membership, role: 'admin' }).success,
    ).toBe(false)
  })
})
