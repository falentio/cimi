const STACK_FRAME_START = /(?:^|\s)at\s+/g
/**
 * Matches a URL-ish token and captures everything before its query string or fragment, so only the
 * `?...` or `#...` tail is dropped. The token must look like a path or URL (it carries a `/`, a
 * scheme `:`, or starts the string), which keeps prose punctuation such as "issue #42" intact.
 */
const URL_QUERY_OR_FRAGMENT =
  /(^|(?:[^\s?#"`]*\/[^\s?#"`]*|[A-Za-z][A-Za-z\d+.-]*:[^\s?#"`]*))[?#]|(^|\s)([?#])(?=[^\s?#=]+[=:])|(["'`])([?#])(?=[^\s?#"`]+)|([([])([?#])(?=[^\s?#=]+[=:])/g

type Quote = '"' | "'" | '`'

function isQuote(value: string | undefined): value is Quote {
  return value === '"' || value === "'" || value === '`'
}

function isWhitespace(value: string | undefined): boolean {
  return value !== undefined && /\s/.test(value)
}

function consumeParenthesized(value: string, start: number): number {
  let depth = 0
  for (let index = start; index < value.length; index += 1) {
    const character = value[index]
    if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return value.length
}

function isStackLocation(value: string, allowRelativeFileName = true): boolean {
  const location = value.trim().replace(/^\(\s*/u, '')
  const hasLineAndColumn = /:\d+:\d+(?:$|[\s),.;:!?}\]]|[#&])/u.test(value)
  const hasLocationPrefix =
    /^(?:\/|[A-Za-z]:[\\/]|(?:file|https?|node|webpack|blob|data):|<anonymous>)/u.test(location)
  const hasFileName = /^[^\s()]+\.(?:[cm]?[jt]sx?|vue|svelte|json|wasm):/iu.test(location)
  return (
    (hasLineAndColumn &&
      (hasLocationPrefix ||
        (allowRelativeFileName && hasFileName) ||
        /<anonymous>/u.test(value))) ||
    /^\((?:<anonymous>|index\s+\d+|native)\)$/u.test(value)
  )
}

function consumeStackFrame(value: string, start: number): number | null {
  let index = start
  if (value.startsWith('async ', index)) index += 6
  if (value.startsWith('new ', index)) index += 4
  const firstTokenStart = index
  while (index < value.length && !isWhitespace(value[index])) index += 1
  const firstToken = value.slice(firstTokenStart, index)
  const attachedLocationStart = firstToken.indexOf('(')
  if (
    attachedLocationStart > 0 &&
    /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u.test(firstToken.slice(0, attachedLocationStart))
  ) {
    const locationStart = firstTokenStart + attachedLocationStart
    const locationEnd = consumeParenthesized(value, locationStart)
    if (isStackLocation(value.slice(locationStart, locationEnd))) return locationEnd
  }
  if (isStackLocation(firstToken)) return index

  while (index < value.length) {
    while (isWhitespace(value[index])) index += 1
    if (index >= value.length) return null
    if (value[index] === '(') {
      const locationEnd = consumeParenthesized(value, index)
      if (isStackLocation(value.slice(index, locationEnd))) return locationEnd
      if (locationEnd === value.length) return null
      index = locationEnd
      continue
    }
    const tokenStart = index
    while (index < value.length && !isWhitespace(value[index])) index += 1
    if (isStackLocation(value.slice(tokenStart, index), false)) return index
  }
  return null
}

function redactStackFrames(value: string): string {
  let redacted = ''
  let cursor = 0
  let searchFrom = 0
  while (searchFrom <= value.length) {
    STACK_FRAME_START.lastIndex = searchFrom
    const match = STACK_FRAME_START.exec(value)
    if (match === null) break
    const frameStart = STACK_FRAME_START.lastIndex
    const frameEnd = consumeStackFrame(value, frameStart)
    if (frameEnd === null) {
      searchFrom = frameStart
      continue
    }
    redacted += value.slice(cursor, match.index)
    cursor = frameEnd
    searchFrom = frameEnd
  }
  STACK_FRAME_START.lastIndex = 0
  return redacted + value.slice(cursor)
}

function findEnclosingQuote(
  value: string,
  start: number,
): { quote: Quote; opening: number } | null {
  let quote: Quote | null = null
  let opening = -1
  for (let index = 0; index < start; index += 1) {
    const character = value[index]
    if (character === '\\') {
      index += 1
      continue
    }
    if (
      quote === null &&
      isQuote(character) &&
      (character !== "'" || index === 0 || isWhitespace(value[index - 1]))
    ) {
      quote = character
      opening = index
    } else if (character === quote) {
      quote = null
      opening = -1
    }
  }
  return quote === null ? null : { quote, opening }
}

function hasUrlContinuation(value: string, start: number): boolean {
  let index = start
  while (isWhitespace(value[index])) index += 1
  while (true) {
    const punctuation = value[index]
    if (punctuation === undefined || !',.;:!?)]}'.includes(punctuation)) break
    index += 1
    while (isWhitespace(value[index])) index += 1
  }
  if (value[index] === '&' || value[index] === '?') return true
  const tokenEnd = value.slice(index).search(/\s/u)
  const token = value.slice(index, tokenEnd === -1 ? value.length : index + tokenEnd)
  return /[=:&_-]/u.test(token)
}

function consumeUrlTail(value: string, start: number, enclosingQuote: Quote | null): number {
  let index = start
  let expectsContinuationValue = false
  while (index < value.length) {
    const character = value[index]
    if (enclosingQuote !== null) {
      if (character === '\\') {
        index += 2
        continue
      }
      if (
        character === enclosingQuote &&
        (index + 1 === value.length ||
          (isWhitespace(value[index + 1]) && !hasUrlContinuation(value, index + 1)) ||
          (',.;:!?)]}'.includes(value[index + 1] ?? '') && !hasUrlContinuation(value, index + 2)))
      ) {
        return index + 1
      }
      index += 1
      continue
    }
    if (isWhitespace(character)) {
      let next = index
      while (isWhitespace(value[next])) next += 1
      const tokenEnd = value.slice(next).search(/\s/)
      const nextToken = value.slice(next, tokenEnd === -1 ? value.length : next + tokenEnd)
      if (nextToken.startsWith('&') || nextToken.startsWith('?') || /[=:&_-]/.test(nextToken)) {
        expectsContinuationValue = /[=:]$/u.test(nextToken)
        index = next
        continue
      }
      if (expectsContinuationValue) {
        expectsContinuationValue = false
        index = next
        continue
      }
      return index
    }
    if (character !== undefined && ')]}'.includes(character)) return index
    if (character === '"' || character === "'" || character === '`') {
      const quote = character
      index += 1
      while (index < value.length) {
        const nestedCharacter = value[index]
        if (nestedCharacter === '\\') {
          index += 2
          continue
        }
        index += 1
        if (nestedCharacter === quote) break
      }
      continue
    }
    index += 1
  }
  return index
}

function redactUrlTails(value: string): string {
  let redacted = ''
  let cursor = 0
  let searchFrom = 0
  while (searchFrom <= value.length) {
    URL_QUERY_OR_FRAGMENT.lastIndex = searchFrom
    const match = URL_QUERY_OR_FRAGMENT.exec(value)
    if (match === null) break
    const tailStart = URL_QUERY_OR_FRAGMENT.lastIndex
    const capturedPrefix = match[1] ?? match[2] ?? match[4] ?? match[6] ?? ''
    const capturedPrefixQuote = isQuote(capturedPrefix[0]) ? capturedPrefix[0] : null
    const enclosingQuote =
      findEnclosingQuote(value, match.index) ??
      (capturedPrefixQuote === null ? null : { quote: capturedPrefixQuote, opening: match.index })
    const tailEnd = consumeUrlTail(value, tailStart, enclosingQuote?.quote ?? null)
    let prefix = value.slice(cursor, match.index)
    if (enclosingQuote !== null && enclosingQuote.opening >= cursor) {
      const opening = enclosingQuote.opening - cursor
      prefix = prefix.slice(0, opening) + prefix.slice(opening + 1)
    }
    const urlPrefix = capturedPrefixQuote === null ? capturedPrefix : capturedPrefix.slice(1)
    redacted += prefix + urlPrefix
    cursor = tailEnd
    searchFrom = tailEnd
  }
  URL_QUERY_OR_FRAGMENT.lastIndex = 0
  return redacted + value.slice(cursor)
}

/**
 * Redacts a diagnostic message accepted from a caller before it reaches a report reader. The
 * collection boundary owns sanitization; this is the second redaction the report contract requires
 * at query output. It drops stack-trace frames and removes URL query strings and fragments, so a
 * message that slipped through collection cannot leak a token or a diagnostic tail.
 */
export function redactDiagnosticMessage(value: string): string {
  const firstLine = value.split(/\r?\n/, 1)[0] ?? ''
  return redactUrlTails(redactStackFrames(firstLine)).trim()
}
