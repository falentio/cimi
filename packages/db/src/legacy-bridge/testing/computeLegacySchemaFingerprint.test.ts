import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LEGACY_SCHEMA_FINGERPRINT, computeLegacySchemaFingerprint } from '../../legacy-bridge.ts'
import { createLegacy471c10dTestDb } from '../../testing/legacy471c10d.ts'

describe('computeLegacySchemaFingerprint', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cimi-legacy-fingerprint-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('matches the pinned legacy 471c10d schema fingerprint', () => {
    const fixture = createLegacy471c10dTestDb({ path: join(dir, 'legacy.sqlite') })
    try {
      expect(computeLegacySchemaFingerprint(fixture.client)).toBe(LEGACY_SCHEMA_FINGERPRINT)
    } finally {
      fixture.close()
    }
  })

  it('is stable across repeated fixture builds and rebuilds of the same database', () => {
    const first = createLegacy471c10dTestDb({ path: join(dir, 'first.sqlite') })
    try {
      const firstFingerprint = computeLegacySchemaFingerprint(first.client)
      const second = createLegacy471c10dTestDb({ path: join(dir, 'second.sqlite') })
      try {
        expect(computeLegacySchemaFingerprint(second.client)).toBe(firstFingerprint)
        expect(computeLegacySchemaFingerprint(first.client)).toBe(firstFingerprint)
      } finally {
        second.close()
      }
    } finally {
      first.close()
    }
  })
})
