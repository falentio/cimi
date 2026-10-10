import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const WORKSPACE_ROOT = fileURLToPath(new URL('../../', import.meta.url))

describe('drizzle.config', () => {
  const original = process.env['CIMI_CONTROL_DB_PATH']

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    if (original === undefined) delete process.env['CIMI_CONTROL_DB_PATH']
    else process.env['CIMI_CONTROL_DB_PATH'] = original
  })

  it('resolves a relative CIMI_CONTROL_DB_PATH against the workspace root', async () => {
    process.env['CIMI_CONTROL_DB_PATH'] = 'rel-miss.sqlite'

    const config = await import('../drizzle.config.ts')

    expect(config.controlDatabaseUrl).toBe(join(WORKSPACE_ROOT, 'rel-miss.sqlite'))
  })
})
