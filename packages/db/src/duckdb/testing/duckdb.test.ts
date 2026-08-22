import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAnalyticsDb } from '../index.ts'

describe('createAnalyticsDb', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-duckdb-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('becomes ready, reopens the same file, and closes', async () => {
    const path = join(dir, 'analytics.duckdb')

    const first = await createAnalyticsDb({ path })
    await expect(first.ready()).resolves.toBe(true)
    await first.close()

    const second = await createAnalyticsDb({ path })
    await expect(second.ready()).resolves.toBe(true)
    await second.close()
  })
})
