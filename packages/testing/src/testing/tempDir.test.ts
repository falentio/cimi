import { afterAll, describe, expect, it } from 'vitest'
import { createTempDataDir, removeTempDataDir } from '../temp-dir.ts'

describe('createTempDataDir', () => {
  const created: string[] = []

  afterAll(async () => {
    await Promise.all(created.map((dir) => removeTempDataDir(dir)))
  })

  it('creates a directory that exists', async () => {
    const dir = await createTempDataDir()
    created.push(dir)
    const { existsSync } = await import('node:fs')
    expect(existsSync(dir)).toBe(true)
  })

  it('honors a custom prefix', async () => {
    const dir = await createTempDataDir('cimi-test-')
    created.push(dir)
    expect(dir).toContain('cimi-test-')
  })
})
