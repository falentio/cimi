import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readControlDatabasePushability } from '../../client.ts'
import { migrateControlDbAtPath } from '../../migrate.ts'

describe('readControlDatabasePushability', () => {
  let dir: string
  let controlPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cimi-control-pushability-'))
    controlPath = join(dir, 'control.sqlite')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('allows a push when the database file is absent', () => {
    expect(readControlDatabasePushability(controlPath)).toEqual({ kind: 'pushable' })
  })

  it('allows a push on an empty database file', () => {
    writeFileSync(controlPath, '')

    expect(readControlDatabasePushability(controlPath)).toEqual({ kind: 'pushable' })
  })

  it('refuses a push when a migrated control database carries tables', () => {
    migrateControlDbAtPath(controlPath)

    expect(readControlDatabasePushability(controlPath)).toEqual({
      kind: 'populated',
      userTables: expect.arrayContaining(['installation', 'event_acceptance_journal']),
    })
  })

  it('refuses a push when a single user table exists', () => {
    const client = new Database(controlPath)

    client.exec('CREATE TABLE probe (id TEXT)')
    client.close()

    expect(readControlDatabasePushability(controlPath)).toEqual({
      kind: 'populated',
      userTables: ['probe'],
    })
  })
})
