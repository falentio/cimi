import { rm } from 'node:fs/promises'
import { createColumnProbeMigrationsFolder } from '@cimi/db/testing'
import { expect, it } from 'vitest'
import { apiTestRequest, createApiTestFixture } from '../../../testing/fixture.ts'
import { createOwnerSite, readyLifecycle } from '../../../testing/reporting-fixture.ts'

const DAY_ONE = '2026-09-05'

const DAY_TWO = '2026-09-06'

it('serves an analytics read when the control store was migrated from a supplied folder', async () => {
  const migrationsFolder = await createColumnProbeMigrationsFolder()

  try {
    await using fixture = await createApiTestFixture({
      lifecycle: readyLifecycle(),
      migrationsFolder,
    })

    const { cookie, siteId } = await createOwnerSite(
      fixture.app,
      fixture.db,
      'report-supplied-folder@example.com',
    )

    await fixture.analytics.rebuild({ controlDb: fixture.db })

    const health = await fixture.app.fetch(new Request('http://localhost/api/system/health'))
    await expect(health.json()).resolves.toMatchObject({ controlStore: 'ready' })

    const response = await apiTestRequest(
      fixture.app,
      `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&granularity=day`,
      cookie,
    )

    expect(response.status, await response.clone().text()).toBe(200)
  } finally {
    await rm(migrationsFolder, { recursive: true, force: true })
  }
})
