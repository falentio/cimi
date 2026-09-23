import { mkdtemp, rm } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb, restoreDbFromBackup } from '../../client.ts'

describe('restoreDbFromBackup', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-restore-sidecar-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('removes tmp sidecars after restore into an open database', async () => {
    const destinationPath = join(dir, 'control.sqlite')
    const db = createDb({ path: destinationPath })
    try {
      db.$client.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, v TEXT)')
      db.$client.prepare('INSERT INTO marker (id, v) VALUES (?, ?)').run(1, 'live')
      await db.$client.backup(join(dir, 'backup.sqlite'))

      await restoreDbFromBackup({
        backupPath: join(dir, 'backup.sqlite'),
        destinationPath,
        db,
      })

      const leftovers = readdirSync(dir).filter((name) => name.includes('.tmp.'))
      expect(leftovers).toEqual([])
      expect(db.$client.prepare('SELECT v FROM marker WHERE id = 1').get()).toEqual({
        v: 'live',
      })
      expect(db.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(db)
    }
  })

  it('removes tmp sidecars after restore without a db handle', async () => {
    const destinationPath = join(dir, 'control.sqlite')
    const live = createDb({ path: destinationPath })
    live.$client.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, v TEXT)')
    await live.$client.backup(join(dir, 'backup.sqlite'))
    closeDb(live)

    await restoreDbFromBackup({
      backupPath: join(dir, 'backup.sqlite'),
      destinationPath,
    })

    const leftovers = readdirSync(dir).filter((name) => name.includes('.tmp.'))
    expect(leftovers).toEqual([])
    const reopened = createDb({ path: destinationPath })
    try {
      expect(reopened.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(reopened)
    }
  })

  it('removes tmp sidecars after restore with prepare opening the staged database', async () => {
    const destinationPath = join(dir, 'control.sqlite')
    const db = createDb({ path: destinationPath })
    try {
      db.$client.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, v TEXT)')
      await db.$client.backup(join(dir, 'backup.sqlite'))

      await restoreDbFromBackup({
        backupPath: join(dir, 'backup.sqlite'),
        destinationPath,
        db,
        prepare: (stagedDb) => {
          stagedDb.$client.exec('CREATE TABLE staged_marker (id INTEGER PRIMARY KEY)')
        },
      })

      const leftovers = readdirSync(dir).filter((name) => name.includes('.tmp.'))
      expect(leftovers).toEqual([])
      expect(
        db.$client
          .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'staged_marker'")
          .get(),
      ).toEqual({ count: 1 })
    } finally {
      closeDb(db)
    }
  })
})
