import { describe, expect, it } from 'vitest'
import { createSiteFixture } from '../fixture.ts'

const allowedKeys = [
  'siteId',
  'status',
  'operationId',
  'requestedAt',
  'deletedAt',
  'recoveryDeadline',
  'purgeAt',
  'cleanup',
]

const deletingStatus = {
  siteId: 'ste_1',
  status: 'deleting' as const,
  operationId: 'sop_1',
  requestedAt: '2026-08-31T00:00:00.000Z',
  deletedAt: null,
  recoveryDeadline: '2026-09-30T00:00:00.000Z',
  purgeAt: null,
  cleanup: { status: 'pending' as const, updatedAt: '2026-08-31T00:00:00.000Z', error: null },
}

const purgedStatus = {
  siteId: 'ste_1',
  status: 'purged' as const,
  operationId: 'sop_purge_1',
  requestedAt: '2026-10-02T00:00:00.000Z',
  deletedAt: '2026-10-02T00:00:00.000Z',
  recoveryDeadline: '2026-10-02T00:00:00.000Z',
  purgeAt: '2026-10-02T00:00:00.000Z',
  cleanup: { status: 'complete' as const, updatedAt: '2026-10-02T00:00:00.000Z', error: null },
}

describe('SiteService.getDeletionStatus allowlist', () => {
  it('exposes only allowlisted keys for a deleting status', async () => {
    const { service, repository } = createSiteFixture()
    repository.getDeletionStatus.mockResolvedValue(deletingStatus)

    const result = await service.getDeletionStatus(
      { siteId: 'ste_1' },
      { id: 'user_1' },
      new Headers(),
    )

    expect(Object.keys(result).sort(), 'deletion status exposes only allowlisted keys').toEqual(
      [...allowedKeys].sort(),
    )
    expect(result, 'deleting status hides hostname').not.toHaveProperty('hostname')
    expect(result, 'deleting status hides ingestionIdentifier').not.toHaveProperty(
      'ingestionIdentifier',
    )
    expect(result, 'deleting status hides reportingTimezone').not.toHaveProperty(
      'reportingTimezone',
    )
    expect(result, 'deleting status hides weekStartsOn').not.toHaveProperty('weekStartsOn')
    expect(result, 'deleting status hides config').not.toHaveProperty('config')
  })

  it('exposes only allowlisted keys for a purged status', async () => {
    const { service, repository } = createSiteFixture()
    repository.getDeletionStatus.mockResolvedValue(purgedStatus)

    const result = await service.getDeletionStatus(
      { siteId: 'ste_1' },
      { id: 'user_1' },
      new Headers(),
    )

    expect(Object.keys(result).sort(), 'purged status exposes only allowlisted keys').toEqual(
      [...allowedKeys].sort(),
    )
    expect(result, 'purged status hides hostname').not.toHaveProperty('hostname')
    expect(result, 'purged status hides ingestionIdentifier').not.toHaveProperty(
      'ingestionIdentifier',
    )
    expect(result, 'purged status hides reportingTimezone').not.toHaveProperty('reportingTimezone')
    expect(result, 'purged status hides weekStartsOn').not.toHaveProperty('weekStartsOn')
    expect(result, 'purged status hides config').not.toHaveProperty('config')
  })
})
