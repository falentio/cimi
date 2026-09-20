import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb, installDbFromFile, type Db } from '../../client.ts'
import { migrateControlDb } from '../../migrate.ts'
import { TUser } from '../../schema/index.ts'

function createStagedDatabase(path: string): Db {
  const staged = createDb({ path })
  migrateControlDb(staged)
  return staged
}

const stagedUser = {
  id: 'staged-user-1',
  name: 'Staged User',
  email: 'staged@example.com',
  emailVerified: true,
  image: null,
  role: null,
  banned: null,
  banReason: null,
  banExpires: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

describe('installFromFile', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-install-from-file-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('replaces a file-backed database and keeps the Db usable through the proxy', async () => {
    const destinationPath = join(dir, 'control.sqlite')
    const db = createDb({ path: destinationPath })
    try {
      db.$client.exec('CREATE TABLE original_marker (id TEXT PRIMARY KEY)')
      db.$client.prepare('INSERT INTO original_marker (id) VALUES (?)').run('original')

      const stagedPath = join(dir, 'staged.sqlite')
      const staged = createStagedDatabase(stagedPath)
      await staged.insert(TUser).values(stagedUser)
      staged.$client.pragma('wal_checkpoint(TRUNCATE)')
      closeDb(staged)

      installDbFromFile(db, stagedPath)

      expect(existsSync(stagedPath)).toBe(false)
      const ledgerRows = db.$client
        .prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations')
        .get() as { count: number }
      expect(ledgerRows.count).toBe(16)
      expect(
        db.$client
          .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'original_marker'")
          .get(),
      ).toEqual({ count: 0 })
      const users = await db.select().from(TUser)
      expect(users).toHaveLength(1)
      expect(users[0]?.id).toBe(stagedUser.id)
      await db
        .insert(TUser)
        .values({ ...stagedUser, id: 'post-install-user', email: 'post-install@example.com' })
      expect(await db.select().from(TUser)).toHaveLength(2)
    } finally {
      closeDb(db)
    }
  })

  it('restores the original file when the staged file is missing', async () => {
    const destinationPath = join(dir, 'control.sqlite')
    const db = createDb({ path: destinationPath })
    try {
      db.$client.exec('CREATE TABLE original_marker (id TEXT PRIMARY KEY)')
      db.$client.prepare('INSERT INTO original_marker (id) VALUES (?)').run('original')

      expect(() => installDbFromFile(db, join(dir, 'missing.sqlite'))).toThrow()

      expect(db.$client.prepare('SELECT id FROM original_marker').all()).toEqual([
        { id: 'original' },
      ])
      db.$client.prepare('INSERT INTO original_marker (id) VALUES (?)').run('post-failure')
      expect(db.$client.prepare('SELECT COUNT(*) AS count FROM original_marker').get()).toEqual({
        count: 2,
      })
      expect(db.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(db)
    }
  })

  it('swaps an in-memory database onto the same Db object', async () => {
    const db = createDb({ path: ':memory:' })
    try {
      db.$client.exec('CREATE TABLE original_marker (id TEXT PRIMARY KEY)')
      db.$client.prepare('INSERT INTO original_marker (id) VALUES (?)').run('original')

      const stagedPath = join(dir, 'staged-memory-source.sqlite')
      const staged = createStagedDatabase(stagedPath)
      await staged.insert(TUser).values(stagedUser)
      staged.$client.pragma('wal_checkpoint(TRUNCATE)')
      closeDb(staged)

      installDbFromFile(db, stagedPath)

      expect(
        db.$client
          .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'original_marker'")
          .get(),
      ).toEqual({ count: 0 })
      const users = await db.select().from(TUser)
      expect(users).toHaveLength(1)
      expect(users[0]?.id).toBe(stagedUser.id)
      await db
        .insert(TUser)
        .values({ ...stagedUser, id: 'post-install-user', email: 'post-install@example.com' })
      expect(await db.select().from(TUser)).toHaveLength(2)
      expect(db.$client.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      closeDb(db)
    }
  })

  it('leaves the old in-memory connection untouched when the staged file is missing', async () => {
    const db = createDb({ path: ':memory:' })
    try {
      db.$client.exec('CREATE TABLE original_marker (id TEXT PRIMARY KEY)')
      db.$client.prepare('INSERT INTO original_marker (id) VALUES (?)').run('original')

      expect(() => installDbFromFile(db, join(dir, 'missing.sqlite'))).toThrow()

      expect(db.$client.prepare('SELECT id FROM original_marker').all()).toEqual([
        { id: 'original' },
      ])
      db.$client.prepare('INSERT INTO original_marker (id) VALUES (?)').run('post-failure')
      expect(db.$client.prepare('SELECT COUNT(*) AS count FROM original_marker').get()).toEqual({
        count: 2,
      })
    } finally {
      closeDb(db)
    }
  })
})
