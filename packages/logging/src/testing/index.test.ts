import { describe, expect, it } from 'vitest'
import { createLoggingConfiguration, toLogError } from '../index.ts'

describe('toLogError', () => {
  it('preserves the useful fields from an Error', () => {
    const error = new TypeError('request failed')

    expect(toLogError(error)).toEqual({
      name: 'TypeError',
      message: 'request failed',
      stack: error.stack,
    })
  })

  it('converts unknown values to a safe error shape', () => {
    expect(toLogError('request failed')).toEqual({
      name: 'UnknownError',
      message: 'request failed',
    })
    expect(
      toLogError({
        toString: () => {
          throw new Error('cannot stringify')
        },
      }),
    ).toEqual({
      name: 'UnknownError',
      message: 'Unknown error',
    })
  })
})

describe('createLoggingConfiguration', () => {
  it('defines one JSON Lines console sink for the cimi root logger', () => {
    const configuration = createLoggingConfiguration()

    expect(Object.keys(configuration.sinks)).toEqual(['console'])
    expect(configuration.loggers).toEqual([
      { category: ['cimi'], lowestLevel: 'info', sinks: ['console'] },
    ])
  })
})
