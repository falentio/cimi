import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb, restoreDbFromBackup, type Db } from '../../client.ts'

describe('restoreDbFromBackup', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-restore-sidecar-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function seedDestination(): { db: Db; destinationPath: string; backupPath: string } {
    const destinationPath = join(dir, 'control.sqlite')
    const backupPath = join(dir, 'backup.sqlite')
    const db = createDb({ path: destinationPath })
    db.$client.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, v TEXT)')
    db.$client.prepare('INSERT INTO marker (id, v) VALUES (?, ?)').run(1, 'live')

    return { db, destinationPath, backupPath }
  }

  function restoreLeftovers(): string[] {
    return readdirSync(dir).filter((name) => name.includes('.tmp.') || name.includes('.previous.'))
  }

  it('removes tmp sidecars after restore into an open database', async () => {
    const { db, destinationPath, backupPath } = seedDestination()

    try {
      await db.$client.backup(backupPath)

      await restoreDbFromBackup({ backupPath, destinationPath, db })

      expect(restoreLeftovers()).toEqual([])
      expect(db.$client.prepare('SELECT v FROM marker WHERE id = 1').get()).toEqual({
        v: 'live',
      })
      expect(db.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(db)
    }
  })

  it('removes tmp sidecars after restore without a db handle', async () => {
    const { db, destinationPath, backupPath } = seedDestination()
    await db.$client.backup(backupPath)
    closeDb(db)

    await restoreDbFromBackup({ backupPath, destinationPath })

    expect(restoreLeftovers()).toEqual([])
    const reopened = createDb({ path: destinationPath })

    try {
      expect(reopened.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(reopened)
    }
  })

  it('removes tmp sidecars after restore with prepare opening the staged database', async () => {
    const { db, destinationPath, backupPath } = seedDestination()

    try {
      await db.$client.backup(backupPath)

      await restoreDbFromBackup({
        backupPath,
        destinationPath,
        db,
        prepare: (stagedDb) => {
          stagedDb.$client.exec('CREATE TABLE staged_marker (id INTEGER PRIMARY KEY)')
        },
      })

      expect(restoreLeftovers()).toEqual([])
      expect(
        db.$client
          .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'staged_marker'")
          .get(),
      ).toEqual({ count: 1 })
    } finally {
      closeDb(db)
    }
  })

  it('removes tmp sidecars when prepare fails with a db handle', async () => {
    const { db, destinationPath, backupPath } = seedDestination()

    try {
      await db.$client.backup(backupPath)

      await expect(
        restoreDbFromBackup({
          backupPath,
          destinationPath,
          db,
          prepare: () => {
            throw new Error('prepare exploded')
          },
        }),
      ).rejects.toThrow('prepare exploded')

      expect(restoreLeftovers()).toEqual([])
      expect(db.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(db)
    }
  })

  it('removes tmp sidecars when prepare fails without a db handle', async () => {
    const { db, destinationPath, backupPath } = seedDestination()
    await db.$client.backup(backupPath)
    closeDb(db)

    await expect(
      restoreDbFromBackup({
        backupPath,
        destinationPath,
        prepare: () => {
          throw new Error('prepare exploded')
        },
      }),
    ).rejects.toThrow('prepare exploded')

    expect(restoreLeftovers()).toEqual([])
  })

  it('removes tmp sidecars after a failed restore', async () => {
    const { db, destinationPath, backupPath } = seedDestination()
    db.$client.pragma('wal_checkpoint(TRUNCATE)')
    await db.$client.backup(backupPath)
    closeDb(db)

    const bytes = readFileSync(backupPath)
    const mid = Math.floor(bytes.length / 2)

    for (let index = mid; index < Math.min(mid + 4096, bytes.length); index += 1) {
      bytes[index] = 0x41
    }

    writeFileSync(backupPath, bytes)

    await expect(restoreDbFromBackup({ backupPath, destinationPath })).rejects.toThrow(
      'database disk image is malformed',
    )

    expect(restoreLeftovers()).toEqual([])
  })

  it('drops a stale destination WAL before restoring without a db handle', async () => {
    const { db, destinationPath, backupPath } = seedDestination()
    db.$client.pragma('wal_checkpoint(TRUNCATE)')
    await db.$client.backup(backupPath)

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

    await restoreDbFromBackup({ backupPath, destinationPath })

    const reopened = createDb({ path: destinationPath })

    try {
      expect(reopened.$client.prepare('SELECT id FROM marker ORDER BY id').all()).toEqual([
        { id: 1 },
      ])
      expect(reopened.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(reopened)
    }
  })
})
