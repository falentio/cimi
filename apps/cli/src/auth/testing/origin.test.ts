import { describe, expect, test } from 'vitest'
import { parseServerOrigin } from '../origin.ts'

describe('parseServerOrigin', () => {
  test('canonicalizes a hostname-only input', () => {
    expect(parseServerOrigin('  Cimi.Example.com/  ')).toEqual({
      ok: true,
      origin: {
        kind: 'server-origin',
        value: 'https://cimi.example.com',
        hostname: 'cimi.example.com',
      },
    })
  })

  test('preserves a non-default port', () => {
    expect(parseServerOrigin('https://CIMI.example.com:8443')).toEqual({
      ok: true,
      origin: {
        kind: 'server-origin',
        value: 'https://cimi.example.com:8443',
        hostname: 'cimi.example.com',
      },
    })
  })

  test('allows HTTP only for loopback development origins', () => {
    expect(parseServerOrigin('http://localhost:3000')).toMatchObject({ ok: true })
    expect(parseServerOrigin('http://127.0.0.1:3000')).toMatchObject({ ok: true })
    expect(parseServerOrigin('http://cimi.example.com')).toEqual({
      ok: false,
      reason: 'insecure-network-origin',
    })
  })

  test('rejects credentials, paths, queries, and fragments', () => {
    expect(parseServerOrigin('https://user:password@example.com')).toEqual({
      ok: false,
      reason: 'credentials-not-allowed',
    })
    expect(parseServerOrigin('https://example.com/app')).toEqual({
      ok: false,
      reason: 'path-not-allowed',
    })
    expect(parseServerOrigin('https://example.com?tenant=one')).toEqual({
      ok: false,
      reason: 'query-not-allowed',
    })
    expect(parseServerOrigin('https://example.com#tenant')).toEqual({
      ok: false,
      reason: 'fragment-not-allowed',
    })
  })

  test('rejects empty and malformed input', () => {
    expect(parseServerOrigin('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseServerOrigin('not a hostname')).toEqual({ ok: false, reason: 'invalid-url' })
  })
})
