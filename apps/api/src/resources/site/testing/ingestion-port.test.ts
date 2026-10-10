import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { createSiteIngestionPort } from '../ingestion-port.ts'
import type { SiteRepository } from '../repository.ts'
import { createSiteRecord } from '../fixture.ts'

const createIngestionSite = () => ({
  id: 'ste_1',
  hostname: 'example.com',
  reportingTimezone: 'Europe/Berlin',
})

describe('createSiteIngestionPort', () => {
  it('projects only the fields ingestion reads', async () => {
    const repository = mock<SiteRepository>()
    repository.findByIngestionIdentifier.mockResolvedValue(createSiteRecord(createIngestionSite()))

    const port = createSiteIngestionPort({ repository })

    await expect(port.findActiveByIngestionIdentifier('ing_1')).resolves.toEqual(
      createIngestionSite(),
    )
    expect(repository.findByIngestionIdentifier).toHaveBeenCalledWith('ing_1')
  })

  it('answers undefined for a site the repository does not return', async () => {
    const repository = mock<SiteRepository>()
    repository.findByIngestionIdentifier.mockResolvedValue(undefined)

    const port = createSiteIngestionPort({ repository })

    await expect(port.findActiveByIngestionIdentifier('ing_missing')).resolves.toBeUndefined()
  })

  it('leaves the active-and-live rule to the repository it delegates to', async () => {
    const repository = mock<SiteRepository>()
    // The adapter runs no status query of its own. The repository filters active and
    // live sites, so a filtered site never reaches the projection.
    repository.findByIngestionIdentifier.mockResolvedValue(undefined)

    const port = createSiteIngestionPort({ repository })
    const site = await port.findActiveByIngestionIdentifier('ing_1')

    expect(site).toBeUndefined()
    expect(repository.findByIngestionIdentifier).toHaveBeenCalledTimes(1)
  })

  it('projects nothing about lifecycle status', async () => {
    const repository = mock<SiteRepository>()
    repository.findByIngestionIdentifier.mockResolvedValue(createSiteRecord())

    const port = createSiteIngestionPort({ repository })
    const site = await port.findActiveByIngestionIdentifier('ing_1')

    expect(site).not.toHaveProperty('status')
    expect(site).not.toHaveProperty('deletedAt')
  })
})
