import { describe, expect, it } from 'vitest'
import { createUserAgentParser, parseUserAgent } from '../index.ts'

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 12; SM-X706B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.53 Safari/537.36'

describe('createUserAgentParser', () => {
  it('returns browser, device, engine, CPU, and operating-system facts', () => {
    const parser = createUserAgentParser()

    expect(parser.parse(CHROME_ANDROID)).toEqual({
      ua: CHROME_ANDROID,
      browser: { name: 'Chrome', version: '103.0.5060.53', major: '103' },
      cpu: { architecture: undefined },
      device: { type: 'tablet', vendor: 'Samsung', model: 'SM-X706B' },
      engine: { name: 'Blink', version: '103.0.5060.53' },
      os: { name: 'Android', version: '12' },
    })
  })

  it('reuses a cached immutable result for repeated user agents', () => {
    const parser = createUserAgentParser({ cacheSize: 1 })

    const first = parser.parse(CHROME_ANDROID)
    const second = parser.parse(CHROME_ANDROID)

    expect(second).toBe(first)
    expect(() => {
      Object.defineProperty(first.browser, 'name', { value: 'changed' })
    }).toThrow(TypeError)
  })

  it('evicts the least recently used result when the cache is full', () => {
    const parser = createUserAgentParser({ cacheSize: 2 })
    const first = parser.parse(CHROME_ANDROID)
    const second = parser.parse('Mozilla/5.0 Chrome/120 Safari/537.36')

    expect(parser.parse(CHROME_ANDROID)).toBe(first)
    parser.parse('curl/8.0')
    expect(parser.parse(second.ua)).not.toBe(second)
  })

  it('caches normalized empty inputs as one LRU entry', () => {
    const parser = createUserAgentParser({ cacheSize: 1 })
    const first = parser.parse(CHROME_ANDROID)
    parser.parse('')

    expect(parser.parse(CHROME_ANDROID)).not.toBe(first)

    const normalizedParser = createUserAgentParser({ cacheSize: 3 })
    const cachedChrome = normalizedParser.parse(CHROME_ANDROID)
    const normalizedEmpty = normalizedParser.parse('')
    expect(normalizedParser.parse(CHROME_ANDROID)).toBe(cachedChrome)
    expect(normalizedParser.parse(' '.repeat(10_000))).toBe(normalizedEmpty)
    normalizedParser.parse('curl/8.0')
    expect(normalizedParser.parse('')).toBe(normalizedEmpty)
    expect(normalizedParser.parse(CHROME_ANDROID)).toBe(cachedChrome)
  })

  it('freezes empty parsed results', () => {
    const empty = createUserAgentParser().parse('')

    expect(() => {
      Object.defineProperty(empty.browser, 'name', { value: 'changed' })
    }).toThrow(TypeError)
  })

  it('supports empty user agents without inventing values', () => {
    expect(createUserAgentParser().parse('')).toEqual({
      ua: '',
      browser: { name: undefined, version: undefined, major: undefined },
      cpu: { architecture: undefined },
      device: { type: undefined, vendor: undefined, model: undefined },
      engine: { name: undefined, version: undefined },
      os: { name: undefined, version: undefined },
    })
  })

  it('rejects an invalid cache size', () => {
    expect(() => createUserAgentParser({ cacheSize: 0 })).toThrow(
      'cacheSize must be an integer between 1 and 100000',
    )
    expect(() => createUserAgentParser({ cacheSize: 1.5 })).toThrow(
      'cacheSize must be an integer between 1 and 100000',
    )
    expect(() => createUserAgentParser({ cacheSize: 100_001 })).toThrow(
      'cacheSize must be an integer between 1 and 100000',
    )
  })

  it('uses the parser-normalized, bounded user-agent value', () => {
    const input = `  ${'A'.repeat(600)}`
    const result = createUserAgentParser().parse(input)

    expect(result.ua).toBe('A'.repeat(500))
  })

  it('preserves short user-agent input as supplied to the parser', () => {
    expect(createUserAgentParser().parse('  curl/8.0').ua).toBe('  curl/8.0')
  })

  it('bounds work for a user agent made entirely of leading whitespace', () => {
    const result = createUserAgentParser().parse(' '.repeat(10_000))

    expect(result).toEqual({
      ua: '',
      browser: { name: undefined, version: undefined, major: undefined },
      cpu: { architecture: undefined },
      device: { type: undefined, vendor: undefined, model: undefined },
      engine: { name: undefined, version: undefined },
      os: { name: undefined, version: undefined },
    })
  })

  it('truncates after bounded leading-whitespace normalization', () => {
    expect(createUserAgentParser().parse(`${' '.repeat(499)}${'A'.repeat(600)}`).ua).toBe(
      'A'.repeat(500),
    )
    expect(createUserAgentParser().parse(`${' '.repeat(500)}${'A'.repeat(600)}`).ua).toBe('')
  })

  it('provides a process-level parser for ordinary callers', () => {
    expect(parseUserAgent(CHROME_ANDROID).browser.name).toBe('Chrome')
  })
})
