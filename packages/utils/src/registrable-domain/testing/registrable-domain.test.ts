import { describe, expect, it } from 'vitest'
import { getRegistrableDomain } from '../index.ts'

describe('getRegistrableDomain', () => {
  it('extracts registrable domains from URLs and hostnames', () => {
    expect(getRegistrableDomain('https://api.v2.example.com:3000/path?q=1#section')).toBe(
      'example.com',
    )
    expect(getRegistrableDomain('api.example.co.uk')).toBe('example.co.uk')
    expect(getRegistrableDomain('WWW.Example.COM.')).toBe('example.com')
  })

  it('applies public suffix wildcard and exception rules', () => {
    expect(getRegistrableDomain('a.ck')).toBeNull()
    expect(getRegistrableDomain('b.a.ck')).toBe('b.a.ck')
    expect(getRegistrableDomain('city.kobe.jp')).toBe('city.kobe.jp')
    expect(getRegistrableDomain('c.kobe.jp')).toBeNull()
    expect(getRegistrableDomain('b.c.kobe.jp')).toBe('b.c.kobe.jp')
  })

  it('preserves private-suffix registrable domains', () => {
    expect(getRegistrableDomain('bar.foo.github.io')).toBe('foo.github.io')
    expect(getRegistrableDomain('bar.foo.s3.amazonaws.com')).toBe('foo.s3.amazonaws.com')
  })

  it('handles local hosts and IP literals without PSL lookup', () => {
    expect(getRegistrableDomain('http://localhost:3000')).toBe('localhost')
    expect(getRegistrableDomain('intranet')).toBe('intranet')
    expect(getRegistrableDomain('192.168.1.1')).toBe('192.168.1.1')
    expect(getRegistrableDomain('https://[2001:db8::1]:8443')).toBe('2001:db8::1')
  })

  it('canonicalizes internationalized hostnames', () => {
    expect(getRegistrableDomain('https://www.bücher.example')).toBe('xn--bcher-kva.example')
    expect(getRegistrableDomain('www.xn--bcher-kva.example')).toBe('xn--bcher-kva.example')
    expect(getRegistrableDomain('www.bücher.de')).toBe('xn--bcher-kva.de')
  })

  it('rejects malformed host-like inputs instead of guessing', () => {
    for (const input of [
      '',
      '://invalid',
      'https://',
      'example.com:8080',
      'api.example.com/path',
      '//example.com',
      'foo..com',
      '127.1',
      '2130706433',
      '192.168.001.001',
    ]) {
      expect(getRegistrableDomain(input)).toBeNull()
    }
  })

  it('rejects listed public suffixes but keeps local and unlisted names', () => {
    expect(getRegistrableDomain('com')).toBeNull()
    expect(getRegistrableDomain('ck')).toBeNull()
    expect(getRegistrableDomain('example.invalid')).toBe('example.invalid')
  })
})
