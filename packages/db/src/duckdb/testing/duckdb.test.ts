import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'
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
    const tempDirectory = join(dir, 'analytics-tmp')

    const first = await createAnalyticsDb({
      path,
      threads: 1,
      memoryLimit: '128MB',
      tempDirectory,
      maxTempDirectorySize: '256MB',
    })
    await expect(first.ready()).resolves.toBe(true)
    await expect(stat(tempDirectory)).resolves.toBeDefined()
    await first.close()
    await expect(first.close()).resolves.toBeUndefined()
    await expect(first.ready()).resolves.toBe(false)

    const inspectionInstance = await DuckDBInstance.create(path, {
      threads: '1',
      memory_limit: '128MB',
      temp_directory: tempDirectory,
      max_temp_directory_size: '256MB',
    })
    const inspectionConnection = await inspectionInstance.connect()
    const tableReader = await inspectionConnection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
    )
    await tableReader.readAll()
    expect(tableReader.getRowObjects().map((row) => String(row['table_name']))).toEqual(
      expect.arrayContaining([
        'analytics_sessions',
        'event_properties',
        'events',
        'projection_checkpoints',
        'projection_gaps',
        'schema_migrations',
        'visitors',
      ]),
    )
    inspectionConnection.closeSync()
    inspectionInstance.closeSync()

    const second = await createAnalyticsDb({
      path,
      threads: 1,
      memoryLimit: '128MB',
      tempDirectory,
      maxTempDirectorySize: '256MB',
    })
    await expect(second.ready()).resolves.toBe(true)
    await second.close()
  })
})
