import { randomBytes } from 'node:crypto'
import { closeSync, fsyncSync, linkSync, openSync, renameSync, unlinkSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema/index.ts'

export const CONTROL_DB_FILENAME = 'control.sqlite'

export type DbStorageLocation = { kind: 'file'; path: string } | { kind: 'memory' }

export interface CreateDbOptions {
  path: string
}

export function createDb(options: CreateDbOptions) {
  const location: DbStorageLocation =
    options.path === ':memory:' ? { kind: 'memory' } : { kind: 'file', path: options.path }
  let current = openConfiguredDatabase(options.path)
  let closed = false
  const client = new Proxy(current, {
    get(_target, property) {
      const value = Reflect.get(current, property, current)
      return typeof value === 'function' ? value.bind(current) : value
    },
    set(_target, property, value) {
      return Reflect.set(current, property, value, current)
    },
  })
  const db = drizzle(client, { schema })
  dbHandles.set(db, {
    isOpen: () => !closed,
    location,
    close: () => {
      if (closed) return
      current.close()
      closed = true
    },
    installFromFile: (stagedPath) => {
      if (location.kind === 'memory') {
        const candidate = openMemoryDatabaseFromStagedFile(stagedPath)
        const previous = current
        current = candidate
        previous.close()
        return
      }
      const destinationPath = location.path
      current.pragma('wal_checkpoint(TRUNCATE)')
      current.close()
      unlinkIfPresent(`${destinationPath}-wal`)
      unlinkIfPresent(`${destinationPath}-shm`)
      const recoveryPath = `${destinationPath}.recovery.${randomBytes(8).toString('hex')}`
      let recoveryHoldsOriginal = false
      try {
        try {
          linkSync(destinationPath, recoveryPath)
        } catch {
          renameSync(destinationPath, recoveryPath)
        }
        recoveryHoldsOriginal = true
        try {
          renameSync(stagedPath, destinationPath)
          current = openConfiguredDatabase(destinationPath)
        } catch (error) {
          unlinkIfPresent(destinationPath)
          unlinkIfPresent(`${destinationPath}-wal`)
          unlinkIfPresent(`${destinationPath}-shm`)
          renameSync(recoveryPath, destinationPath)
          recoveryHoldsOriginal = false
          current = openConfiguredDatabase(destinationPath)
          throw error
        }
      } finally {
        if (recoveryHoldsOriginal) unlinkIfPresent(recoveryPath)
      }
    },
    replaceFromFile: (sourcePath, destinationPath) => {
      if (closed) {
        renameSync(sourcePath, destinationPath)
        return
      }
      const previousPath = `${destinationPath}.previous.${randomBytes(8).toString('hex')}`
      let previousMoved = false
      current.pragma('wal_checkpoint(TRUNCATE)')
      current.close()
      unlinkIfPresent(`${destinationPath}-wal`)
      unlinkIfPresent(`${destinationPath}-shm`)
      try {
        renameSync(destinationPath, previousPath)
        previousMoved = true
        renameSync(sourcePath, destinationPath)
        current = openConfiguredDatabase(destinationPath)
      } catch (error) {
        if (previousMoved) {
          unlinkIfPresent(destinationPath)
          unlinkIfPresent(`${destinationPath}-wal`)
          unlinkIfPresent(`${destinationPath}-shm`)
          renameSync(previousPath, destinationPath)
          current = openConfiguredDatabase(destinationPath)
        }
        throw error
      }
      try {
        unlinkIfPresent(previousPath)
        unlinkIfPresent(`${previousPath}-wal`)
        unlinkIfPresent(`${previousPath}-shm`)
      } catch {}
    },
  })
  return db
}

export type Db = ReturnType<typeof createDb>

const closedDatabases = new WeakSet<Db>()
const dbHandles = new WeakMap<Db, DbHandle>()

interface DbHandle {
  isOpen(): boolean
  location: DbStorageLocation
  close(): void
  installFromFile(stagedPath: string): void
  replaceFromFile(sourcePath: string, destinationPath: string): void
}

export function dbStorageLocation(db: Db): DbStorageLocation {
  const handle = dbHandles.get(db)
  if (handle === undefined) {
    throw new Error('Database was not created by createDb')
  }
  return handle.location
}

export function installDbFromFile(db: Db, stagedPath: string): void {
  const handle = dbHandles.get(db)
  if (handle === undefined) {
    throw new Error('Database was not created by createDb')
  }
  handle.installFromFile(stagedPath)
}

export function closeDb(db: Db): void {
  if (closedDatabases.has(db)) return
  const handle = dbHandles.get(db)
  if (handle === undefined) {
    db.$client.close()
  } else {
    handle.close()
  }
  closedDatabases.add(db)
}

export async function restoreDbFromBackup(input: {
  backupPath: string
  destinationPath: string
  db?: Db | undefined
  prepare?: ((db: Db) => void | Promise<void>) | undefined
}): Promise<void> {
  const tmpPath = `${input.destinationPath}.tmp.${randomBytes(8).toString('hex')}`
  try {
    const backup = new Database(input.backupPath, { fileMustExist: true, readonly: true })
    try {
      await backup.backup(tmpPath)
    } finally {
      backup.close()
    }
    const fd = openSync(tmpPath, 'r')
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    const restored = new Database(tmpPath, { readonly: true })
    try {
      const rows = restored.prepare('PRAGMA integrity_check').all() as Array<{
        integrity_check: string
      }>
      if (rows.length === 0 || rows.some((row) => row.integrity_check !== 'ok')) {
        throw new Error('Restored database integrity check failed')
      }
    } finally {
      restored.close()
    }

    if (input.prepare !== undefined) {
      const stagedDb = createDb({ path: tmpPath })
      try {
        await input.prepare(stagedDb)
        stagedDb.$client.pragma('wal_checkpoint(TRUNCATE)')
      } finally {
        closeDb(stagedDb)
      }
    }

    const handle = input.db === undefined ? undefined : dbHandles.get(input.db)
    if (handle?.isOpen()) {
      handle.replaceFromFile(tmpPath, input.destinationPath)
    } else {
      renameSync(tmpPath, input.destinationPath)
    }
  } finally {
    unlinkIfPresent(tmpPath)
    unlinkIfPresent(`${tmpPath}-wal`)
    unlinkIfPresent(`${tmpPath}-shm`)
  }
}

function openConfiguredDatabase(path: string): Database.Database {
  const sqlite = new Database(path)
  try {
    applyConnectionPragmas(sqlite)
    return sqlite
  } catch (error) {
    sqlite.close()
    throw error
  }
}

function openMemoryDatabaseFromStagedFile(stagedPath: string): Database.Database {
  const staged = new Database(stagedPath, { fileMustExist: true })
  let serialized: Buffer
  try {
    staged.pragma('wal_checkpoint(TRUNCATE)')
    staged.pragma('journal_mode = DELETE')
    serialized = staged.serialize()
  } finally {
    staged.close()
  }
  const candidate = new Database(serialized)
  try {
    candidate.pragma('synchronous = FULL')
    candidate.pragma('foreign_keys = ON')
    candidate.pragma('busy_timeout = 5000')
    const integrity = candidate.pragma('integrity_check', { simple: true }) as string
    if (integrity !== 'ok') {
      throw new Error(`Installed memory database integrity check failed: ${integrity}`)
    }
    return candidate
  } catch (error) {
    candidate.close()
    throw error
  }
}

function applyConnectionPragmas(sqlite: Database.Database): void {
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = FULL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('wal_autocheckpoint = 1000')
}

function unlinkIfPresent(path: string): void {
  try {
    unlinkSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
