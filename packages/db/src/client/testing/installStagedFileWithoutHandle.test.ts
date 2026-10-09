import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb, installStagedFileWithoutHandle } from '../../client.ts'

describe('installStagedFileWithoutHandle', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-install-no-handle-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function leftovers(): string[] {
    return readdirSync(dir).filter(
      (name) =>
        name.includes('.tmp.') || name.includes('.recovery.') || name.includes('.previous.'),
    )
  }

  function seedDestination(destinationPath: string): void {
    const db = createDb({ path: destinationPath })
    db.$client.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, v TEXT)')
    db.$client.prepare('INSERT INTO marker (id, v) VALUES (?, ?)').run(1, 'live')
    db.$client.pragma('wal_checkpoint(TRUNCATE)')
    closeDb(db)
  }

  function buildStagedFile(stagedPath: string): void {
    const staged = createDb({ path: stagedPath })
    staged.$client.exec('CREATE TABLE staged_marker (id INTEGER PRIMARY KEY, v TEXT)')
    staged.$client.prepare('INSERT INTO staged_marker (id, v) VALUES (?, ?)').run(1, 'staged-row')
    staged.$client.pragma('wal_checkpoint(TRUNCATE)')
    closeDb(staged)
  }

  it('drops a stale destination WAL and installs the staged schema', () => {
    const destinationPath = join(dir, 'control.sqlite')
    const db = createDb({ path: destinationPath })
    db.$client.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, v TEXT)')
    db.$client.prepare('INSERT INTO marker (id, v) VALUES (?, ?)').run(1, 'live')
    db.$client.pragma('wal_checkpoint(TRUNCATE)')

    const snapshotMain = join(dir, 'crashed.sqlite')
    const snapshotWal = join(dir, 'crashed.sqlite-wal')
    const stale = new Database(destinationPath)

    try {
      stale.pragma('wal_autocheckpoint = 0')
      stale.prepare('INSERT INTO marker (id, v) VALUES (?, ?)').run(2, 'stale')
      copyFileSync(destinationPath, snapshotMain)
      copyFileSync(`${destinationPath}-wal`, snapshotWal)
    } finally {
      stale.close()
    }

    closeDb(db)
    copyFileSync(snapshotMain, destinationPath)
    copyFileSync(snapshotWal, `${destinationPath}-wal`)

    const stagedPath = join(dir, 'staged.sqlite')
    buildStagedFile(stagedPath)

    installStagedFileWithoutHandle({ destinationPath, stagedPath })

    const reopened = createDb({ path: destinationPath })

    try {
      expect(reopened.$client.prepare('SELECT id, v FROM staged_marker').all()).toEqual([
        { id: 1, v: 'staged-row' },
      ])
      expect(
        reopened.$client
          .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'marker'")
          .get(),
      ).toEqual({ count: 0 })
      expect(reopened.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(reopened)
    }

    expect(leftovers()).toEqual([])
  })

  it('restores the original destination when the staged file is missing', () => {
    const destinationPath = join(dir, 'control.sqlite')
    seedDestination(destinationPath)

    expect(() =>
      installStagedFileWithoutHandle({
        destinationPath,
        stagedPath: join(dir, 'missing.sqlite'),
      }),
    ).toThrow()

    const reopened = createDb({ path: destinationPath })

    try {
      expect(reopened.$client.prepare('SELECT id, v FROM marker').all()).toEqual([
        { id: 1, v: 'live' },
      ])
      reopened.$client.prepare('INSERT INTO marker (id, v) VALUES (?, ?)').run(2, 'post-failure')
      expect(reopened.$client.prepare('SELECT COUNT(*) AS count FROM marker').get()).toEqual({
        count: 2,
      })
      expect(reopened.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(reopened)
    }

    expect(leftovers()).toEqual([])
  })

  it('installs over a destination with no sidecars', () => {
    const destinationPath = join(dir, 'control.sqlite')
    seedDestination(destinationPath)

    expect(existsSync(`${destinationPath}-wal`)).toBe(false)
    expect(existsSync(`${destinationPath}-shm`)).toBe(false)

    const stagedPath = join(dir, 'staged.sqlite')
    buildStagedFile(stagedPath)

    installStagedFileWithoutHandle({ destinationPath, stagedPath })

    expect(existsSync(stagedPath)).toBe(false)

    const reopened = createDb({ path: destinationPath })

    try {
      expect(reopened.$client.prepare('SELECT id, v FROM staged_marker').all()).toEqual([
        { id: 1, v: 'staged-row' },
      ])
      expect(reopened.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(reopened)
    }

    expect(leftovers()).toEqual([])
  })
})
