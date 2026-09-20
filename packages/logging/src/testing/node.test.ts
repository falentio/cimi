import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConfig, resetSync } from '@logtape/logtape'
import { reportLogEvent } from '../index.ts'
import { configureNodeLogging } from '../node.ts'

describe('configureNodeLogging', () => {
  afterEach(() => {
    if (getConfig() !== null) resetSync()
  })

  it('keeps the selected level stable and rejects conflicting repeat calls', () => {
    configureNodeLogging({ lowestLevel: 'warning' })
    const configuration = getConfig()
    const contextLocalStorage = configuration?.contextLocalStorage

    configureNodeLogging({ lowestLevel: 'warning' })

    expect(configuration?.loggers[0]?.lowestLevel).toBe('warning')
    expect(getConfig()?.contextLocalStorage).toBe(contextLocalStorage)

    expect(() => configureNodeLogging({ lowestLevel: 'debug' })).toThrow(
      'Node logging is already configured at warning, cannot change it to debug',
    )
  })

  it('suppresses informational records at warning level', () => {
    const infoOutput = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warningOutput = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      configureNodeLogging({ lowestLevel: 'warning' })
      infoOutput.mockClear()
      warningOutput.mockClear()
      reportLogEvent({
        kind: 'api.http',
        method: 'GET',
        path: '/api/system/health',
        status: 200,
        responseTimeMs: 1,
      })
      reportLogEvent({
        kind: 'api.error',
        method: 'GET',
        path: '/api/organization/createOrganization',
        code: 'BAD_REQUEST',
        status: 400,
        error: new Error('invalid request'),
      })

      expect(infoOutput).not.toHaveBeenCalled()
      expect(warningOutput).toHaveBeenCalledTimes(1)
    } finally {
      warningOutput.mockRestore()
      infoOutput.mockRestore()
    }
  })
})
