import { afterEach, describe, expect, it } from 'vitest'
import { getConfig, resetSync } from '@logtape/logtape'
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
})
