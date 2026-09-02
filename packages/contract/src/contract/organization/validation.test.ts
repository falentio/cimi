import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SOrganizationCreateInput, SOrganizationCreateOutput } from './command/create.ts'
import { SOrganizationDeleteInput, SOrganizationDeleteOutput } from './command/delete.ts'
import {
  SOrganizationEnsurePersonalInput,
  SOrganizationEnsurePersonalOutput,
} from './command/ensure-personal-organization.ts'
import { SOrganizationUpdateInput, SOrganizationUpdateOutput } from './command/update.ts'
import { SOrganization } from './schema.ts'
import { SOrganizationGetInput, SOrganizationGetOutput } from './query/get.ts'
import { SOrganizationListInput, SOrganizationListOutput } from './query/list.ts'

const organization = {
  id: 'organization-1',
  name: 'Analytics',
  ownerUserId: 'user-1',
  isPersonal: false,
  createdAt: '2026-08-23T00:00:00Z',
  updatedAt: '2026-08-23T00:00:00Z',
}

const page = {
  items: [organization],
  nextOffset: null,
  hasMore: false,
  totalCount: 1,
}

describe('organization contract', () => {
  it('accepts valid command inputs and the strict empty Personal Organization input', () => {
    expect(v.parse(SOrganizationCreateInput, { name: 'Analytics' })).toEqual({
      name: 'Analytics',
    })
    expect(
      v.parse(SOrganizationUpdateInput, { organizationId: 'organization-1', name: 'Reports' }),
    ).toEqual({ organizationId: 'organization-1', name: 'Reports' })
    expect(v.parse(SOrganizationGetInput, { organizationId: 'organization-1' })).toEqual({
      organizationId: 'organization-1',
    })
    expect(v.parse(SOrganizationDeleteInput, { organizationId: 'organization-1' })).toEqual({
      organizationId: 'organization-1',
    })
    expect(v.parse(SOrganizationEnsurePersonalInput, {})).toEqual({})
  })

  it('rejects invalid IDs, names, and unknown command keys', () => {
    expect(() => v.parse(SOrganizationCreateInput, { name: '' })).toThrow(v.ValiError)
    expect(() => v.parse(SOrganizationCreateInput, { name: 'x'.repeat(257) })).toThrow(v.ValiError)
    expect(() =>
      v.parse(SOrganizationCreateInput, { name: 'Analytics', organizationId: 'organization-1' }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SOrganizationUpdateInput, { organizationId: '', name: 'Analytics' }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SOrganizationUpdateInput, {
        organizationId: 'o'.repeat(129),
        name: 'Analytics',
      }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SOrganizationUpdateInput, { organizationId: 'organization-1', name: '' }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SOrganizationGetInput, { organizationId: 'organization-1', extra: true }),
    ).toThrow(v.ValiError)
    expect(() => v.parse(SOrganizationEnsurePersonalInput, { extra: true })).toThrow(v.ValiError)
  })

  it('coerces list pagination and rejects invalid or unknown query values', () => {
    expect(v.parse(SOrganizationListInput, { offset: '2', limit: '10' })).toEqual({
      offset: 2,
      limit: 10,
    })
    expect(() => v.parse(SOrganizationListInput, { offset: -1 })).toThrow(v.ValiError)
    expect(() => v.parse(SOrganizationListInput, { limit: 0 })).toThrow(v.ValiError)
    expect(() => v.parse(SOrganizationListInput, { limit: 101 })).toThrow(v.ValiError)
    expect(() => v.parse(SOrganizationListInput, { offset: '' })).toThrow(v.ValiError)
    expect(() => v.parse(SOrganizationListInput, { limit: '1.5' })).toThrow(v.ValiError)
    expect(() => v.parse(SOrganizationListInput, { unexpected: 1 })).toThrow(v.ValiError)
  })

  it('validates complete Organization and paginated output shapes', () => {
    expect(v.parse(SOrganization, organization)).toEqual(organization)
    expect(v.parse(SOrganizationCreateOutput, organization)).toEqual(organization)
    expect(v.parse(SOrganizationUpdateOutput, organization)).toEqual(organization)
    expect(
      v.parse(SOrganizationEnsurePersonalOutput, { ...organization, isPersonal: true }),
    ).toEqual({ ...organization, isPersonal: true })
    expect(v.parse(SOrganizationGetOutput, organization)).toEqual(organization)
    expect(v.parse(SOrganizationListOutput, page)).toEqual(page)
    expect(v.parse(SOrganizationDeleteOutput, undefined)).toBeUndefined()
  })

  it('rejects incomplete, malformed, and extra Organization output fields', () => {
    expect(() =>
      v.parse(SOrganizationGetOutput, { ...organization, updatedAt: 'not-a-date' }),
    ).toThrow(v.ValiError)
    expect(() => v.parse(SOrganizationGetOutput, { ...organization, ownerUserId: '' })).toThrow(
      v.ValiError,
    )
    expect(() => v.parse(SOrganizationGetOutput, { ...organization, extra: true })).toThrow(
      v.ValiError,
    )
    expect(() => v.parse(SOrganizationListOutput, { ...page, totalCount: -1 })).toThrow(v.ValiError)
    expect(() => v.parse(SOrganizationListOutput, { ...page, nextOffset: -1 })).toThrow(v.ValiError)
    expect(() => v.parse(SOrganizationDeleteOutput, null)).toThrow(v.ValiError)
  })
})
