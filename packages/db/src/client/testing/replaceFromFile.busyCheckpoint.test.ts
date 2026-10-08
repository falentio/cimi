import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb, restoreDbFromBackup } from '../../client.ts'

describe('restoreDbFromBackup busy checkpoint', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-busy-checkpoint-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function seedDatabase(path: string, rows: number) {
    const db = createDb({ path })
    db.$client.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, v TEXT)')
    const insert = db.$client.prepare('INSERT INTO marker (id, v) VALUES (?, ?)')
    db.$client.transaction((count: number) => {
      for (let index = 0; index < count; index += 1) insert.run(index, 'seed')
    })(rows)

    return db
  }

  it(
    'refuses to replace a control database whose WAL still holds committed frames',
    { timeout: 120_000 },
    async () => {
      const destinationPath = join(dir, 'control.sqlite')
      const backupPath = join(dir, 'backup.sqlite')
      const db = seedDatabase(destinationPath, 3000)

      try {
        db.$client.pragma('wal_checkpoint(TRUNCATE)')
        await db.$client.backup(backupPath)
      } finally {
        closeDb(db)
      }

      const live = createDb({ path: destinationPath })
      const reader = new Database(destinationPath, { readonly: true })

      try {
        reader.exec('BEGIN')
        reader.prepare('SELECT COUNT(*) AS count FROM marker').get()

        const insert = live.$client.prepare('INSERT INTO marker (id, v) VALUES (?, ?)')
        live.$client.transaction((count: number) => {
          for (let index = 0; index < count; index += 1) insert.run(3000 + index, 'grow')
        })(3000)

        const expected = live.$client.prepare('SELECT COUNT(*) AS count FROM marker').get()

        await expect(
          restoreDbFromBackup({ backupPath, destinationPath, db: live }),
        ).rejects.toMatchObject({ name: 'ControlDatabaseBusyError' })

        expect(live.$client.prepare('SELECT COUNT(*) AS count FROM marker').get()).toEqual(expected)
        expect(live.$client.pragma('integrity_check', { simple: true })).toBe('ok')
      } finally {
        try {
          reader.exec('ROLLBACK')
        } catch {}

        reader.close()
        closeDb(live)
      }
    },
  )

  it(
    'restores normally when no other connection holds the database open',
    { timeout: 120_000 },
    async () => {
      const destinationPath = join(dir, 'control.sqlite')
      const backupPath = join(dir, 'backup.sqlite')
      const db = seedDatabase(destinationPath, 10)

      try {
        await db.$client.backup(backupPath)
        await restoreDbFromBackup({ backupPath, destinationPath, db })

        expect(db.$client.prepare('SELECT COUNT(*) AS count FROM marker').get()).toEqual({
          count: 10,
        })
        expect(db.$client.pragma('integrity_check', { simple: true })).toBe('ok')
      } finally {
        closeDb(db)
      }
    },
  )
})
