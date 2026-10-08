import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb, sweepRestoreStagingFiles } from '../../client.ts'

describe('sweepRestoreStagingFiles', () => {
  let dir: string
  let controlPath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-staging-sweep-'))
    controlPath = join(dir, 'control.sqlite')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function write(name: string): void {
    writeFileSync(join(dir, name), 'x')
  }

  it('removes tmp staging files with their sidecars', () => {
    const staging = [
      'control.sqlite.tmp.0123456789abcdef',
      'control.sqlite.tmp.0123456789abcdef-wal',
      'control.sqlite.tmp.0123456789abcdef-shm',
    ]

    for (const name of [...staging, 'control.sqlite', 'backup.sqlite']) write(name)

    sweepRestoreStagingFiles({ controlDatabasePath: controlPath })

    expect(readdirSync(dir).sort()).toEqual(['backup.sqlite', 'control.sqlite'])
  })

  it('removes tmp staging files when the control database is absent', () => {
    const staging = [
      'control.sqlite.tmp.0123456789abcdef',
      'control.sqlite.tmp.0123456789abcdef-wal',
      'control.sqlite.tmp.0123456789abcdef-shm',
    ]

    for (const name of staging) write(name)

    sweepRestoreStagingFiles({ controlDatabasePath: controlPath })

    expect(readdirSync(dir)).toEqual([])
  })

  it('keeps the crash-recovery copies and unrelated files', () => {
    const kept = [
      'control.sqlite',
      'control.sqlite-wal',
      'control.sqlite-shm',
      'control.sqlite.previous.0123456789abcdef',
      'control.sqlite.previous.0123456789abcdef-wal',
      'control.sqlite.recovery.0123456789abcdef',
      'control.sqlite.tmp.not-hex',
      'control.sqlite.tmp.0123456789abcdef0',
      'control.sqlite.previous.0123456789ABCDEF',
      'other.sqlite.tmp.0123456789abcdef',
    ]

    for (const name of kept) write(name)

    sweepRestoreStagingFiles({ controlDatabasePath: controlPath })

    expect(readdirSync(dir).sort()).toEqual([...kept].sort())
  })

  it('keeps a previous copy whether or not the control database exists', () => {
    const previous = [
      'control.sqlite.previous.fedcba9876543210',
      'control.sqlite.previous.fedcba9876543210-wal',
      'control.sqlite.previous.fedcba9876543210-shm',
    ]

    for (const name of previous) write(name)

    sweepRestoreStagingFiles({ controlDatabasePath: controlPath })

    expect(readdirSync(dir).sort()).toEqual([...previous].sort())

    write('control.sqlite')
    sweepRestoreStagingFiles({ controlDatabasePath: controlPath })

    expect(readdirSync(dir).sort()).toEqual(['control.sqlite', ...previous].sort())
  })

  it('keeps a previous copy across two boots that recreate an empty control database', () => {
    const previous = 'control.sqlite.previous.fedcba9876543210'
    writeFileSync(join(dir, previous), 'the only copy of the database')

    sweepRestoreStagingFiles({ controlDatabasePath: controlPath })
    const firstBoot = createDb({ path: controlPath })
    firstBoot.$client.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY)')
    closeDb(firstBoot)

    sweepRestoreStagingFiles({ controlDatabasePath: controlPath })

    expect(existsSync(join(dir, previous))).toBe(true)
  })

  it('is a no-op when no staging file exists', () => {
    sweepRestoreStagingFiles({ controlDatabasePath: controlPath })
    sweepRestoreStagingFiles({ controlDatabasePath: controlPath })

    expect(readdirSync(dir)).toEqual([])
  })
})
