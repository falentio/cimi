import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { createSiteIngestionPort } from '../ingestion-port.ts'
import type { SiteRepository } from '../repository.ts'
import { createSiteRecord } from '../fixture.ts'

describe('SiteIngestionPort', () => {
  it('projects only the fields ingestion reads', async () => {
    const repository = mock<SiteRepository>()

    const record = createSiteRecord({
      id: 'ste_1',
      hostname: 'example.com',
      reportingTimezone: 'Europe/Berlin',
    })

    repository.findByIngestionIdentifier.mockResolvedValue(record)

    const port = createSiteIngestionPort({ repository })

    await expect(port.findActiveByIngestionIdentifier('ing_1')).resolves.toEqual({
      id: 'ste_1',
      hostname: 'example.com',
      reportingTimezone: 'Europe/Berlin',
    })
  })

  it('answers undefined for a missing site', async () => {
    const repository = mock<SiteRepository>()
    repository.findByIngestionIdentifier.mockResolvedValue(undefined)

    const port = createSiteIngestionPort({ repository })

    await expect(port.findActiveByIngestionIdentifier('ing_missing')).resolves.toBeUndefined()
  })

  it('projects nothing about lifecycle status', async () => {
    const repository = mock<SiteRepository>()
    repository.findByIngestionIdentifier.mockResolvedValue(createSiteRecord())

    const port = createSiteIngestionPort({ repository })
    const site = await port.findActiveByIngestionIdentifier('ing_1')

    expect(site).not.toHaveProperty('status')
  })
})
