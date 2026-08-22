import { describe, expect, it } from 'vitest'
import { ORPCError } from '@orpc/server'
import { assertIsAdmin, assertOwner, assertOwnerOrAdmin } from '../../guard.ts'
import type { AuthUser } from '@cimi/auth'

const adminUser = { id: 'u1', role: 'admin' } as unknown as AuthUser
const normalUser = { id: 'u1', role: 'user' } as unknown as AuthUser

describe('assertIsAdmin', () => {
  it('throws FORBIDDEN for undefined user', () => {
    expect(() => assertIsAdmin(undefined)).toThrowError(ORPCError<string, unknown>)
    try {
      assertIsAdmin(undefined)
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect((error as ORPCError<string, unknown>).code).toBe('FORBIDDEN')
    }
  })

  it('throws FORBIDDEN for non-admin user', () => {
    expect(() => assertIsAdmin(normalUser)).toThrowError(ORPCError<string, unknown>)
    try {
      assertIsAdmin(normalUser)
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect((error as ORPCError<string, unknown>).code).toBe('FORBIDDEN')
    }
  })

  it('allows admin user', () => {
    expect(() => assertIsAdmin(adminUser)).not.toThrow()
  })
})

describe('assertOwner', () => {
  it('denies when id does not match', () => {
    expect(() => assertOwner({ id: 'a' }, 'b')).toThrowError(ORPCError<string, unknown>)
    try {
      assertOwner({ id: 'a' }, 'b')
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect((error as ORPCError<string, unknown>).code).toBe('FORBIDDEN')
    }
  })

  it('allows when id matches', () => {
    expect(() => assertOwner({ id: 'a' }, 'a')).not.toThrow()
  })
})

describe('assertOwnerOrAdmin', () => {
  it('allows owner match', () => {
    expect(() => assertOwnerOrAdmin(normalUser, 'u1')).not.toThrow()
  })

  it('allows admin', () => {
    expect(() => assertOwnerOrAdmin(adminUser, 'other')).not.toThrow()
  })

  it('denies non-owner non-admin', () => {
    expect(() => assertOwnerOrAdmin(normalUser, 'other')).toThrowError(ORPCError<string, unknown>)
    try {
      assertOwnerOrAdmin(normalUser, 'other')
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect((error as ORPCError<string, unknown>).code).toBe('FORBIDDEN')
    }
  })
})

describe('AssertOptions.code', () => {
  it('changes error code to NOT_FOUND', () => {
    try {
      assertIsAdmin(undefined, { code: 'NOT_FOUND' })
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect((error as ORPCError<string, unknown>).code).toBe('NOT_FOUND')
    }
  })

  it('changes error code for assertOwner', () => {
    try {
      assertOwner({ id: 'a' }, 'b', { code: 'NOT_FOUND' })
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect((error as ORPCError<string, unknown>).code).toBe('NOT_FOUND')
    }
  })

  it('changes error code for assertOwnerOrAdmin', () => {
    try {
      assertOwnerOrAdmin(normalUser, 'other', { code: 'NOT_FOUND' })
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError)
      expect((error as ORPCError<string, unknown>).code).toBe('NOT_FOUND')
    }
  })
})
