import { LRUCache } from 'lru-cache'

// The MIT legacy line avoids the AGPL license and keeps this adapter on the stable common field set.
import UAParser from 'ua-parser-js'

const DEFAULT_CACHE_SIZE = 10_000
const MAX_CACHE_SIZE = 100_000
const UA_MAX_LENGTH = 500

export interface ParsedUserAgent {
  readonly ua: string
  readonly browser: Readonly<{
    name: string | undefined
    version: string | undefined
    major: string | undefined
  }>
  readonly cpu: Readonly<{ architecture: string | undefined }>
  readonly device: Readonly<{
    type: string | undefined
    vendor: string | undefined
    model: string | undefined
  }>
  readonly engine: Readonly<{
    name: string | undefined
    version: string | undefined
  }>
  readonly os: Readonly<{
    name: string | undefined
    version: string | undefined
  }>
}

export interface UserAgentParserOptions {
  cacheSize?: number
}

// TODO: Consume from apps/api event enrichment and apps/frontend analytics projection once their contracts settle.
export interface UserAgentParser {
  parse(userAgent: string): ParsedUserAgent
}

export function createUserAgentParser(options: UserAgentParserOptions = {}): UserAgentParser {
  const cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE
  if (!Number.isInteger(cacheSize) || cacheSize < 1 || cacheSize > MAX_CACHE_SIZE) {
    throw new RangeError(`cacheSize must be an integer between 1 and ${MAX_CACHE_SIZE}`)
  }

  const cache = new LRUCache<string, ParsedUserAgent>({ max: cacheSize })

  return {
    parse(userAgent) {
      if (userAgent === '') return EMPTY_PARSED_USER_AGENT

      const parserInput = normalizeUserAgentInput(userAgent)
      const cached = cache.get(parserInput)
      if (cached !== undefined) return cached

      const result = toParsedUserAgent(UAParser(parserInput))
      cache.set(parserInput, result)
      return result
    },
  }
}

const defaultParser = createUserAgentParser()

const EMPTY_PARSED_USER_AGENT: ParsedUserAgent = Object.freeze({
  ua: '',
  browser: Object.freeze({ name: undefined, version: undefined, major: undefined }),
  cpu: Object.freeze({ architecture: undefined }),
  device: Object.freeze({ type: undefined, vendor: undefined, model: undefined }),
  engine: Object.freeze({ name: undefined, version: undefined }),
  os: Object.freeze({ name: undefined, version: undefined }),
})

export function parseUserAgent(userAgent: string): ParsedUserAgent {
  return defaultParser.parse(userAgent)
}

function toParsedUserAgent(result: UAParser.IResult): ParsedUserAgent {
  return Object.freeze({
    ua: result.ua,
    browser: Object.freeze({
      name: result.browser.name,
      version: result.browser.version,
      major: result.browser.major,
    }),
    cpu: Object.freeze({ architecture: result.cpu.architecture }),
    device: Object.freeze({
      type: result.device.type,
      vendor: result.device.vendor,
      model: result.device.model,
    }),
    engine: Object.freeze({ name: result.engine.name, version: result.engine.version }),
    os: Object.freeze({ name: result.os.name, version: result.os.version }),
  })
}

function normalizeUserAgentInput(userAgent: string): string {
  if (userAgent.length <= UA_MAX_LENGTH) return userAgent

  const boundedPrefix = userAgent.substring(0, UA_MAX_LENGTH)
  const leadingWhitespace = boundedPrefix.match(/^\s*/)?.[0].length ?? 0
  if (leadingWhitespace === UA_MAX_LENGTH) return ''

  return userAgent.substring(leadingWhitespace, leadingWhitespace + UA_MAX_LENGTH)
}
