import { describe, expect, it } from 'vitest'

import { ConfigError, loadConfig } from '../index.ts'

describe('loadConfig', () => {
  it('throws ConfigError listing BETTER_AUTH_SECRET when secret is absent', () => {
    let caught: unknown
    try {
      loadConfig({ CIMI_DATA_DIR: '/tmp/x' })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ConfigError)
    expect((caught as Error).message).toContain('BETTER_AUTH_SECRET')
  })

  it('treats an empty secret as invalid', () => {
    expect(() => loadConfig({ BETTER_AUTH_SECRET: '' })).toThrowError(ConfigError)
  })

  it('applies defaults', () => {
    const config = loadConfig({ BETTER_AUTH_SECRET: 's3cret' })
    expect(config.dataDir).toBe(`${process.cwd()}/.cimi`)
    expect(config.authSecret).toBe('s3cret')
    expect(config.baseUrl).toBe('http://localhost:4321')
    expect(config.isDev).toBe(true)
  })

  it('honors custom env values', () => {
    const config = loadConfig({
      BETTER_AUTH_SECRET: 's3cret',
      CIMI_DATA_DIR: 'data/custom',
      BETTER_AUTH_URL: 'https://cimi.example.com',
      NODE_ENV: 'production',
    })
    expect(config.dataDir).toBe(`${process.cwd()}/data/custom`)
    expect(config.authSecret).toBe('s3cret')
    expect(config.baseUrl).toBe('https://cimi.example.com')
    expect(config.isDev).toBe(false)
  })

  it('rejects an invalid auth URL', () => {
    expect(() =>
      loadConfig({
        BETTER_AUTH_SECRET: 's3cret',
        BETTER_AUTH_URL: 'not-a-url',
      }),
    ).toThrowError(ConfigError)
  })

  it('rejects an unsupported node environment', () => {
    expect(() =>
      loadConfig({
        BETTER_AUTH_SECRET: 's3cret',
        NODE_ENV: 'staging',
      }),
    ).toThrowError(ConfigError)
  })

  it('omits event ingestion fields when their env vars are absent', () => {
    const config = loadConfig({ BETTER_AUTH_SECRET: 's3cret' })
    expect(config.eventIngestion).toEqual({})
  })

  it('parses event ingestion overrides into typed fields', () => {
    const config = loadConfig({
      BETTER_AUTH_SECRET: 's3cret',
      CIMI_EVENT_SITE_RATE_PER_SECOND: '120',
      CIMI_EVENT_SITE_BURST: '600',
      CIMI_EVENT_SOURCE_IP_RATE_PER_SECOND: '30',
      CIMI_EVENT_SOURCE_IP_BURST: '150',
      CIMI_EVENT_TRUST_PROXY_HEADERS: 'true',
    })
    expect(config.eventIngestion).toEqual({
      siteRatePerSecond: 120,
      siteBurst: 600,
      sourceIpRatePerSecond: 30,
      sourceIpBurst: 150,
      trustProxyHeaders: true,
    })
  })

  it('rejects invalid event ingestion env values', () => {
    expect(() =>
      loadConfig({
        BETTER_AUTH_SECRET: 's3cret',
        CIMI_EVENT_SITE_RATE_PER_SECOND: 'not-a-number',
      }),
    ).toThrowError(ConfigError)
    expect(() =>
      loadConfig({
        BETTER_AUTH_SECRET: 's3cret',
        CIMI_EVENT_SOURCE_IP_BURST: '0',
      }),
    ).toThrowError(ConfigError)
    expect(() =>
      loadConfig({
        BETTER_AUTH_SECRET: 's3cret',
        CIMI_EVENT_TRUST_PROXY_HEADERS: 'yes',
      }),
    ).toThrowError(ConfigError)
  })
})
