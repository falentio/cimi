import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrphanedControlDatabaseError, prepareControlDatabase } from '../../client.ts'

describe('prepareControlDatabase', () => {
  let dir: string
  let controlPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cimi-prepare-control-'))
    controlPath = join(dir, 'control.sqlite')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates the parent directory and reports nothing to reclaim on a fresh install', () => {
    const nested = join(dir, 'nested', 'control.sqlite')

    const result = prepareControlDatabase({ controlDatabasePath: nested })

    expect(result.reclaimError).toBeUndefined()
    expect(existsSync(join(dir, 'nested'))).toBe(true)
  })

  it('removes orphaned tmp staging files and reports nothing to reclaim', () => {
    const staging = [
      'control.sqlite.tmp.0123456789abcdef',
      'control.sqlite.tmp.0123456789abcdef-wal',
      'control.sqlite.tmp.0123456789abcdef-shm',
    ]

    for (const name of staging) writeFileSync(join(dir, name), 'x')

    const result = prepareControlDatabase({ controlDatabasePath: controlPath })

    expect(result.reclaimError).toBeUndefined()
    expect(readdirSync(dir).filter((name) => name.includes('.tmp.'))).toEqual([])
  })

  it('refuses to initialize an empty database when a previous copy survives', () => {
    writeFileSync(join(dir, 'control.sqlite.previous.fedcba9876543210'), 'the only copy')

    expect(() => prepareControlDatabase({ controlDatabasePath: controlPath })).toThrow(
      OrphanedControlDatabaseError,
    )
    expect(existsSync(controlPath)).toBe(false)
    expect(existsSync(join(dir, 'control.sqlite.previous.fedcba9876543210'))).toBe(true)
  })

  it('refuses to initialize an empty database when a recovery copy survives', () => {
    writeFileSync(join(dir, 'control.sqlite.recovery.fedcba9876543210'), 'the only copy')

    expect(() => prepareControlDatabase({ controlDatabasePath: controlPath })).toThrow(
      OrphanedControlDatabaseError,
    )
    expect(existsSync(controlPath)).toBe(false)
  })

  it('names every recovery copy it found', () => {
    writeFileSync(join(dir, 'control.sqlite.previous.fedcba9876543210'), 'a')
    writeFileSync(join(dir, 'control.sqlite.recovery.0123456789abcdef'), 'b')

    let caught: unknown

    try {
      prepareControlDatabase({ controlDatabasePath: controlPath })
    } catch (error) {
      caught = error
    }

    if (!(caught instanceof OrphanedControlDatabaseError)) {
      throw new Error('expected OrphanedControlDatabaseError')
    }

    expect(caught.recoveryPaths).toEqual([
      join(dir, 'control.sqlite.previous.fedcba9876543210'),
      join(dir, 'control.sqlite.recovery.0123456789abcdef'),
    ])
  })

  it('ignores recovery sidecars when the database is absent', () => {
    writeFileSync(join(dir, 'control.sqlite.previous.fedcba9876543210-wal'), 'x')
    writeFileSync(join(dir, 'control.sqlite.previous.fedcba9876543210-shm'), 'x')

    const result = prepareControlDatabase({ controlDatabasePath: controlPath })

    expect(result.reclaimError).toBeUndefined()
  })

  it('accepts a present control database beside a recovery copy', () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(controlPath, 'live')
    writeFileSync(join(dir, 'control.sqlite.previous.fedcba9876543210'), 'redundant')

    const result = prepareControlDatabase({ controlDatabasePath: controlPath })

    expect(result.reclaimError).toBeUndefined()
  })
})
