import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SSiteCreateInput } from './command/create.ts'
import { SSiteUpdateV2Input } from './command/update-v2.ts'
import { SSite } from './schema.ts'

describe('site hostname contract', () => {
  it('canonicalizes create input before uniqueness and persistence', () => {
    const parsed = v.parse(SSiteCreateInput, {
      organizationId: 'org-1',
      name: 'Example',
      hostname: 'WWW.Example.test.',
    })

    expect(parsed.hostname).toBe('www.example.test')
  })

  it('canonicalizes update input and Site output', () => {
    const update = v.parse(SSiteUpdateV2Input, {
      siteId: 'site-1',
      name: 'Example',
      hostname: 'API.Example.test.',
      reportingTimezone: 'UTC',
      weekStartsOn: 'monday',
    })
    const site = v.parse(SSite, {
      id: 'site-1',
      organizationId: 'org-1',
      name: 'Example',
      hostname: 'API.Example.test.',
      ingestionIdentifier: 'ingest-1',
      reportingTimezone: 'UTC',
      weekStartsOn: 'monday',
      createdAt: '2026-08-23T00:00:00Z',
      updatedAt: '2026-08-23T00:00:00Z',
    })

    expect(update.hostname).toBe('api.example.test')
    expect(site.hostname).toBe('api.example.test')
  })
})
