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
})
