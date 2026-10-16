import { configureSync, type Sink } from '@logtape/logtape'
import { describe, expect, it } from 'vitest'
import { reportLogEvent } from '../index.ts'
import { captureLogEvents } from './index.ts'

describe('captureLogEvents', () => {
  it('captures what an operation failure reported', () => {
    const capture = captureLogEvents()

    try {
      reportLogEvent({
        kind: 'operation.failure',
        operation: 'site.lifecycle',
        stage: 'site-delete',
        siteId: 'ste_1',
        error: new Error('release stopped at deleted'),
      })

      expect(capture.records).toEqual([
        {
          message: 'Operation failed',
          properties: expect.objectContaining({
            operation: 'site.lifecycle',
            stage: 'site-delete',
            siteId: 'ste_1',
            error: expect.objectContaining({ message: 'release stopped at deleted' }),
          }),
        },
      ])
    } finally {
      capture.stop()
    }
  })

  it('stops capturing once it is stopped', () => {
    const capture = captureLogEvents()

    capture.stop()

    reportLogEvent({
      kind: 'operation.failure',
      operation: 'demo-seed',
      stage: 'record-failure',
      error: new Error('seed failed'),
    })

    expect(capture.records).toEqual([])
  })

  it('restores the configuration it replaced', () => {
    const outer: string[] = []

    const sink: Sink = (record) => {
      outer.push(record.message.map((part) => String(part)).join(''))
    }

    configureSync({
      reset: true,
      sinks: { outer: sink },
      loggers: [{ category: 'cimi', sinks: ['outer'], lowestLevel: 'debug' }],
    })

    const capture = captureLogEvents()

    try {
      reportLogEvent({
        kind: 'operation.failure',
        operation: 'demo-seed',
        stage: 'record-failure',
        error: new Error('seed failed'),
      })

      expect(outer).toEqual([])
      expect(capture.records).toHaveLength(1)
    } finally {
      capture.stop()
    }

    reportLogEvent({
      kind: 'operation.failure',
      operation: 'demo-seed',
      stage: 'record-failure',
      error: new Error('seed failed'),
    })

    expect(outer).toEqual(['Operation failed'])
    expect(capture.records).toHaveLength(1)
  })
})
