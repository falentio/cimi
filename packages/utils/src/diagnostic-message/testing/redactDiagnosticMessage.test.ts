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
    expect(redactDiagnosticMessage('Fetch failed for /cb#token=secret')).toBe(
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
    expect(redactDiagnosticMessage('at handler (/app/a.ts:1:2)')).toBe('')
    expect(
      redactDiagnosticMessage('Error at first (/app/first.ts:1:2) at second (/app/second.ts:3:4)'),
    ).toBe('Error')
  })

  it('removes an async stack frame including its path', () => {
    expect(redactDiagnosticMessage('boom at async handler (/app/secret.ts:1:2) after')).toBe(
      'boom after',
    )
  })

  it('redacts the complete query when a value contains an apostrophe', () => {
    expect(redactDiagnosticMessage("Request failed for /search?q=O'Reilly&token=secret")).toBe(
      'Request failed for /search',
    )
  })

  it('removes constructor and aliased stack frames', () => {
    expect(redactDiagnosticMessage('Error\n    at new Foo (/app/foo.ts:1:2)')).toBe('Error')
    expect(redactDiagnosticMessage('Error at Object.foo [as bar] (/app/foo.ts:1:2)')).toBe('Error')
    expect(redactDiagnosticMessage('Error at handler (/app/(secret)/foo.ts:1:2) after')).toBe(
      'Error after',
    )
    expect(redactDiagnosticMessage('Error at handler(/app/secret.ts:1:2) after')).toBe(
      'Error after',
    )
    expect(redactDiagnosticMessage('Error at handler ( /app/secret.ts:1:2 ) after')).toBe(
      'Error after',
    )
    expect(redactDiagnosticMessage('Error at /app/(secret)/foo.ts:1:2 after')).toBe('Error after')
    expect(redactDiagnosticMessage('Error at foo bar (file:///app/secret.ts:1:2)')).toBe('Error')
    expect(redactDiagnosticMessage('Error at foo /app/secret.ts:1:2 after')).toBe('Error after')
    expect(redactDiagnosticMessage('Error at foo (not a frame) /app/secret.ts:1:2 after')).toBe(
      'Error after',
    )
    expect(redactDiagnosticMessage('Error at Array.map (<anonymous>)')).toBe('Error')
    expect(redactDiagnosticMessage('Error at not a frame:1:2 after')).toBe(
      'Error at not a frame:1:2 after',
    )
  })

  it('redacts quoted and unterminated URL query values', () => {
    expect(redactDiagnosticMessage('GET /search?q="secret value"&token=other failed')).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage('GET /search?q=`secret value`&token=other failed')).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage('GET /search?q="secret value&token=other failed')).toBe(
      'GET /search',
    )
    expect(redactDiagnosticMessage('GET "/search?q=secret value&token=other" failed')).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage("GET '/search?q=secret value&token=other' failed")).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage("GET /search?q='secret' &token=other failed")).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage("GET '/search?q=O'Reilly &token=secret' failed")).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage("can't fetch /search?q=secret failed")).toBe(
      "can't fetch /search failed",
    )
    expect(redactDiagnosticMessage("GET https://example.test/O'Reilly?token=secret failed")).toBe(
      "GET https://example.test/O'Reilly failed",
    )
    expect(redactDiagnosticMessage("GET '/search?q=foo',bar&token=secret' failed")).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage("GET '/search?q=foo', bar&token=secret' failed")).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage("GET '/search?q=O',sensitive-token' failed")).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage('GET /search?q=public token:secret failed')).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage('GET /search?q=public token: secret failed')).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage('GET /search?q=public sensitive-token failed')).toBe(
      'GET /search failed',
    )
    expect(redactDiagnosticMessage('Request failed for ?token=secret')).toBe('Request failed for')
    expect(redactDiagnosticMessage('Request failed for #token=secret')).toBe('Request failed for')
    expect(redactDiagnosticMessage("GET '?token=secret'")).toBe('GET')
    expect(redactDiagnosticMessage("GET '?token=secret")).toBe('GET')
    expect(redactDiagnosticMessage('GET "#token=secret"')).toBe('GET')
    expect(redactDiagnosticMessage('Request failed (?token=secret)')).toBe('Request failed ()')
    expect(redactDiagnosticMessage('Request failed [#token=secret]')).toBe('Request failed []')
    expect(redactDiagnosticMessage('GET "#SECRET"')).toBe('GET')
    expect(redactDiagnosticMessage("GET 'https://example.test/O'Reilly?token=secret'.")).toBe(
      "GET https://example.test/O'Reilly.",
    )
    expect(
      redactDiagnosticMessage('Error at handler (/app/secret.ts:1:2, token=secret) after'),
    ).toBe('Error after')
    expect(redactDiagnosticMessage('Error at handler (/app/foo.ts:1:2&token=secret) after')).toBe(
      'Error after',
    )
    expect(redactDiagnosticMessage('Error at async Promise.all (index 0) after')).toBe(
      'Error after',
    )
    expect(redactDiagnosticMessage('Error at handler (native) after')).toBe('Error after')
  })

  it('returns an empty string for an empty message', () => {
    expect(redactDiagnosticMessage('')).toBe('')
  })

  it('keeps prose question marks and issue numbers intact', () => {
    expect(redactDiagnosticMessage('issue #42 is unresolved, why?')).toBe(
      'issue #42 is unresolved, why?',
    )
    expect(redactDiagnosticMessage('The cat sat at noon?')).toBe('The cat sat at noon?')
    expect(redactDiagnosticMessage('The value is at native now')).toBe('The value is at native now')
    expect(redactDiagnosticMessage('The request failed at handler after retry')).toBe(
      'The request failed at handler after retry',
    )
    expect(redactDiagnosticMessage('The incident happened at 12:30? Please confirm.')).toBe(
      'The incident happened at 12:30? Please confirm.',
    )
    expect(redactDiagnosticMessage('The report says at least one server.ts:1:2 is affected.')).toBe(
      'The report says at least one server.ts:1:2 is affected.',
    )
  })
})
