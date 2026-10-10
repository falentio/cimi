import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateControlDbAtPath } from '../../migrate.ts'
import { readControlDatabaseTables } from '../../push.ts'

describe('readControlDatabaseTables', () => {
  let dir: string
  let controlPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cimi-control-tables-'))
    controlPath = join(dir, 'control.sqlite')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reports no tables when the database file is absent', () => {
    expect(readControlDatabaseTables(controlPath)).toEqual([])
  })

  it('reports no tables on an empty database file', () => {
    writeFileSync(controlPath, '')

    expect(readControlDatabaseTables(controlPath)).toEqual([])
  })

  it('reports the tables of a migrated control database', () => {
    migrateControlDbAtPath(controlPath)

    expect(readControlDatabaseTables(controlPath)).toEqual(
      expect.arrayContaining(['installation', 'event_acceptance_journal']),
    )
  })

  it('reports a single user table when only one exists', () => {
    const client = new Database(controlPath)

    client.exec('CREATE TABLE probe (id TEXT)')
    client.close()

    expect(readControlDatabaseTables(controlPath)).toEqual(['probe'])
  })
})
