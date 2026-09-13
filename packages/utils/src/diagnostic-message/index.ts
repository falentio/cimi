const STACK_FRAME = /\s*at\s+[^\s(]+(?:\s+\([^)]*\))?/g
/**
 * Matches a URL-ish token and captures everything before its query string or fragment, so only the
 * `?...` or `#...` tail is dropped. The token must look like a path or URL (it carries a `/`, a
 * scheme `:`, or starts the string), which keeps prose punctuation such as "issue #42" intact.
 */
const URL_QUERY_OR_FRAGMENT = /(^|[^\s?#"'`]*[:/][^\s?#"'`]*)[?#][^\s"'`]+/g

/**
 * Redacts a diagnostic message accepted from a caller before it reaches a report reader. The
 * collection boundary owns sanitization; this is the second redaction the report contract requires
 * at query output. It drops stack-trace frames and removes URL query strings and fragments, so a
 * message that slipped through collection cannot leak a token or a diagnostic tail.
 */
export function redactDiagnosticMessage(value: string): string {
  const firstLine = value.split(/\r?\n/, 1)[0] ?? ''
  return firstLine.replace(STACK_FRAME, '').replace(URL_QUERY_OR_FRAGMENT, '$1').trim()
}
