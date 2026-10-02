import { describe, expect, it } from 'vitest'
import { BackupIncompatibilityError } from '../errors.ts'
import { unreadableSqliteCode } from '../executor.ts'

function sqliteError(code: string): Error {
  return Object.assign(new Error(code), { code, name: 'SqliteError' })
}

describe('unreadableSqliteCode', () => {
  it('returns the code for corruption SQLite cannot read past', () => {
    expect(unreadableSqliteCode(sqliteError('SQLITE_NOTADB'))).toBe('SQLITE_NOTADB')
    expect(unreadableSqliteCode(sqliteError('SQLITE_CORRUPT'))).toBe('SQLITE_CORRUPT')
    expect(unreadableSqliteCode(sqliteError('SQLITE_CORRUPT_INDEX'))).toBe('SQLITE_CORRUPT_INDEX')
  })

  it('leaves every other SQLite failure unmapped', () => {
    expect(unreadableSqliteCode(sqliteError('SQLITE_BUSY'))).toBeUndefined()
    expect(unreadableSqliteCode(sqliteError('SQLITE_LOCKED'))).toBeUndefined()
    expect(unreadableSqliteCode(sqliteError('SQLITE_CANTOPEN'))).toBeUndefined()
    expect(unreadableSqliteCode(sqliteError('SQLITE_READONLY'))).toBeUndefined()
    expect(unreadableSqliteCode(sqliteError('SQLITE_PERM'))).toBeUndefined()
    expect(unreadableSqliteCode(sqliteError('SQLITE_FULL'))).toBeUndefined()
    expect(unreadableSqliteCode(sqliteError('SQLITE_IOERR_READ'))).toBeUndefined()
    expect(unreadableSqliteCode(new Error('database is locked'))).toBeUndefined()
    expect(unreadableSqliteCode(new BackupIncompatibilityError('unreadable'))).toBeUndefined()
    expect(unreadableSqliteCode(undefined)).toBeUndefined()
    expect(unreadableSqliteCode('SQLITE_CORRUPT')).toBeUndefined()
  })
})
