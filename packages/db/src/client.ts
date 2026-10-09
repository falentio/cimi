import { randomBytes } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema/index.ts'
import { isFunctionValue, isStringValue } from '@cimi/utils'

export const CONTROL_DB_FILENAME = 'control.sqlite'

export type DbStorageLocation = { kind: 'file'; path: string } | { kind: 'memory' }

export interface CreateDbOptions {
  path: string
}

/**
 * A TRUNCATE checkpoint could not fold every committed frame into the main database file,
 * because another connection holds a read snapshot or an open write transaction. The frames it
 * left behind live only in the -wal sidecar, so unlinking it would silently drop committed rows.
 */
export class ControlDatabaseBusyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ControlDatabaseBusyError'
  }
}

/** Thrown when the control database is absent while a crash-recovery copy survives beside it. */
export class OrphanedControlDatabaseError extends Error {
  readonly controlDatabasePath: string
  readonly recoveryPaths: readonly string[]

  constructor(input: { controlDatabasePath: string; recoveryPaths: readonly string[] }) {
    super(
      `Control database ${input.controlDatabasePath} is missing but a crash-recovery copy ` +
        `survives: ${input.recoveryPaths.join(', ')}. Refusing to initialize an empty database. ` +
        `Move the recovery file into place or restore from a backup.`,
    )
    this.name = 'OrphanedControlDatabaseError'
    this.controlDatabasePath = input.controlDatabasePath
    this.recoveryPaths = input.recoveryPaths
  }
}

export function createDb(options: CreateDbOptions) {
  const location: DbStorageLocation =
    options.path === ':memory:' ? { kind: 'memory' } : { kind: 'file', path: options.path }

  let current = openConfiguredDatabase(options.path)
  let closed = false

  const client = new Proxy(current, {
    get(_target, property) {
      // SAFETY: Proxy trap scopes dynamic keys to the current client's own keys.
      const value: unknown = current[property as keyof typeof current]

      return isFunctionValue(value) ? value.bind(current) : value
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
      checkpointTruncateOrThrow(current, destinationPath)
      current.close()
      removeSidecars(destinationPath)

      try {
        current = swapStagedFileIntoPlace({ destinationPath, stagedPath })
      } catch (error) {
        current = openConfiguredDatabase(destinationPath)
        throw error
      }
    },
    replaceFromFile: (sourcePath, destinationPath) => {
      if (closed) {
        renameSync(sourcePath, destinationPath)

        return
      }

      checkpointTruncateOrThrow(current, destinationPath)
      current.close()
      removeSidecars(destinationPath)

      try {
        current = swapStagedFileIntoPlace({ destinationPath, stagedPath: sourcePath })
      } catch (error) {
        current = openConfiguredDatabase(destinationPath)
        throw error
      }
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
  const backupSidecars = sidecarPresence(input.backupPath)

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
      // SAFETY: better-sqlite3 returns any; single integrity_check column selected below.
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
        checkpointTruncateOrThrow(stagedDb.$client, tmpPath)
      } finally {
        closeDb(stagedDb)
      }
    }

    const handle = input.db === undefined ? undefined : dbHandles.get(input.db)

    if (handle?.isOpen()) {
      handle.replaceFromFile(tmpPath, input.destinationPath)
    } else {
      removeSidecars(input.destinationPath)
      renameSync(tmpPath, input.destinationPath)
    }
  } finally {
    discardSqliteFile(tmpPath)
    discardCreatedSidecars(backupSidecars)
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
    checkpointTruncateOrThrow(staged, stagedPath)
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
    // SAFETY: better-sqlite3 returns any; integrity_check with simple:true returns a string.
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

type CheckpointTruncateResult = { busy: number; log: number; checkpointed: number }

/**
 * Folds the write-ahead log into the main database file and refuses to continue when it cannot.
 *
 * wal_checkpoint(TRUNCATE) is authoritative about the frames it left behind: `busy` marks an
 * unfinished pass and `checkpointed < log` means committed frames survive only in the -wal
 * sidecar. A caller that removes that sidecar after this returns would drop those rows, so a
 * partial result throws instead of letting the unlink happen.
 */
function checkpointTruncateOrThrow(sqlite: Database.Database, path: string): void {
  // SAFETY: better-sqlite3 pragma() returns unknown; wal_checkpoint returns one fixed-shape row.
  const rows = sqlite.pragma('wal_checkpoint(TRUNCATE)') as CheckpointTruncateResult[]
  const result = rows[0]

  if (result === undefined) return

  if (result.busy !== 0 || result.checkpointed !== result.log) {
    throw new ControlDatabaseBusyError(
      `Could not checkpoint ${basename(path)} before replacing it. Another connection holds ` +
        `the database open, leaving ${result.log - result.checkpointed} committed frame(s) only ` +
        `in the write-ahead log. Retry once that connection closes.`,
    )
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
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
}

function removeSidecars(path: string): void {
  unlinkIfPresent(`${path}-wal`)
  unlinkIfPresent(`${path}-shm`)
}

function removeSqliteFile(path: string): void {
  unlinkIfPresent(path)
  removeSidecars(path)
}

/**
 * Directory fsync is unsupported on some platforms and filesystems, which reject it with EINVAL or
 * ENOTSUP; those are tolerated. Any other failure propagates, because the swap may not be durable.
 */
function fsyncDirectory(path: string): void {
  let fd: number

  try {
    fd = openSync(path, 'r')
  } catch {
    return
  }

  try {
    fsyncSync(fd)
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined

    if (isStringValue(code) && ['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'].includes(code)) {
      return
    }

    throw error
  } finally {
    closeSync(fd)
  }
}

/**
 * Installs a staged database over the live one. The destination is parked at a .recovery sibling by
 * hard link, or by copy when the filesystem refuses a link, then one atomic rename replaces it.
 * POSIX rename swaps the destination in a single step, so no reader observes a missing control
 * database. The caller has already checkpointed the live handle, closed it, and removed its sidecars.
 */
function swapStagedFileIntoPlace(input: {
  destinationPath: string
  stagedPath: string
}): Database.Database {
  const directory = dirname(input.destinationPath)
  const recoveryPath = `${input.destinationPath}.recovery.${randomBytes(8).toString('hex')}`
  let recoveryHoldsOriginal = false

  try {
    try {
      linkSync(input.destinationPath, recoveryPath)
    } catch {
      copyFileSync(input.destinationPath, recoveryPath)
    }

    recoveryHoldsOriginal = true

    try {
      renameSync(input.stagedPath, input.destinationPath)
      fsyncDirectory(directory)

      return openConfiguredDatabase(input.destinationPath)
    } catch (error) {
      removeSqliteFile(input.destinationPath)
      renameSync(recoveryPath, input.destinationPath)
      fsyncDirectory(directory)
      recoveryHoldsOriginal = false
      throw error
    }
  } finally {
    if (recoveryHoldsOriginal) discardSqliteFile(recoveryPath)
  }
}

/** Reading a WAL-mode artifact through a readonly handle creates -wal and -shm next to it. */
function sidecarPresence(path: string): ReadonlyArray<{ path: string; existed: boolean }> {
  return [`${path}-wal`, `${path}-shm`].map((sidecarPath) => ({
    path: sidecarPath,
    existed: existsSync(sidecarPath),
  }))
}

/** A pre-existing WAL can hold uncommitted frames, so this leaves it in place. */
function discardCreatedSidecars(sidecars: ReadonlyArray<{ path: string; existed: boolean }>): void {
  for (const sidecar of sidecars) {
    if (sidecar.existed) continue

    try {
      unlinkSync(sidecar.path)
    } catch {}
  }
}

function discardSqliteFile(path: string): void {
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      unlinkSync(candidate)
    } catch {}
  }
}

const RESTORE_STAGING_FILE_NAME = /^(.+)\.tmp\.[0-9a-fA-F]{16}(?:-wal|-shm)?$/

const RECOVERY_COPY_FILE_NAME = /^(.+)\.(?:previous|recovery)\.[0-9a-fA-F]{16}$/

/**
 * Removes .tmp restore staging files from the control database directory. A staging file is a
 * partial write that was never renamed into place, so the destination always predates it and
 * deleting it cannot lose the only copy. The .previous and .recovery copies a swap parks beside
 * the control database are crash-recovery artifacts and are never swept here.
 */
export function sweepRestoreStagingFiles(input: { controlDatabasePath: string }): void {
  const directory = dirname(input.controlDatabasePath)
  const controlDatabaseName = basename(input.controlDatabasePath)
  let entries: string[]

  try {
    entries = readdirSync(directory)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }

  for (const name of entries) {
    if (RESTORE_STAGING_FILE_NAME.exec(name)?.[1] !== controlDatabaseName) continue

    discardSqliteFile(join(directory, name))
  }
}

export interface PrepareControlDatabaseResult {
  readonly reclaimError: Error | undefined
}

/**
 * Makes the control database path safe to open. Throws OrphanedControlDatabaseError when the
 * database is absent while a crash-recovery copy survives beside it, because a missing database is
 * otherwise a fresh install and opening would orphan real rows.
 */
export function prepareControlDatabase(input: {
  controlDatabasePath: string
}): PrepareControlDatabaseResult {
  const directory = dirname(input.controlDatabasePath)
  mkdirSync(directory, { recursive: true })
  let reclaimError: Error | undefined

  try {
    sweepRestoreStagingFiles({ controlDatabasePath: input.controlDatabasePath })
  } catch (error) {
    reclaimError = error instanceof Error ? error : new Error(String(error))
  }

  if (existsSync(input.controlDatabasePath)) return { reclaimError }

  const recoveryPaths = findRecoveryCopies(input.controlDatabasePath)

  if (recoveryPaths.length > 0) {
    throw new OrphanedControlDatabaseError({
      controlDatabasePath: input.controlDatabasePath,
      recoveryPaths,
    })
  }

  return { reclaimError }
}

function findRecoveryCopies(controlDatabasePath: string): readonly string[] {
  const directory = dirname(controlDatabasePath)
  const controlDatabaseName = basename(controlDatabasePath)
  let entries: string[]

  try {
    entries = readdirSync(directory)
  } catch {
    return []
  }

  return entries
    .filter((name) => RECOVERY_COPY_FILE_NAME.exec(name)?.[1] === controlDatabaseName)
    .map((name) => join(directory, name))
    .sort()
}
