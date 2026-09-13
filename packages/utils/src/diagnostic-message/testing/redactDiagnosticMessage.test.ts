import { describe, expect, it } from 'vitest'
import { redactDiagnosticMessage } from '../index.ts'

describe('redactDiagnosticMessage', () => {
  it('drops stack-trace frames and keeps the leading message line', () => {
    const message = [
      'TypeError: cannot read properties of undefined',
      '    at collect (/app/src/handler.ts:42:7)',
      '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
    ].join('\n')

    expect(redactDiagnosticMessage(message)).toBe('TypeError: cannot read properties of undefined')
  })

  it('strips the query string and fragment from a URL', () => {
    expect(redactDiagnosticMessage('Fetch failed for /cb?token=secret&code=abc')).toBe(
      'Fetch failed for /cb',
    )
  })

  it('strips the query string from an absolute URL', () => {
    expect(redactDiagnosticMessage('GET https://api.example.com/v1/events?api_key=k failed')).toBe(
      'GET https://api.example.com/v1/events failed',
    )
  })

  it('removes an inline stack frame but keeps surrounding text', () => {
    expect(redactDiagnosticMessage('boom at handler (/app/a.ts:1:2) after')).toBe('boom after')
  })

  it('returns an empty string for an empty message', () => {
    expect(redactDiagnosticMessage('')).toBe('')
  })

  it('keeps prose question marks and issue numbers intact', () => {
    expect(redactDiagnosticMessage('issue #42 is unresolved, why?')).toBe(
      'issue #42 is unresolved, why?',
    )
  })
})
