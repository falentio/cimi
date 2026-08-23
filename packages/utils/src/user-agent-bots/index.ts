import { LRUCache } from 'lru-cache'

import { ALL_BOT_PATTERNS, type BotCategory } from './patterns.ts'

export type { BotCategory } from './patterns.ts'

export interface BotClassification {
  isBot: boolean
  category: BotCategory | null
  matchedPattern: string | null
}

const NON_BOT: BotClassification = { isBot: false, category: null, matchedPattern: null }

// classifyUA runs on every event (when bot blocking is enabled) and, for bot
// user-agents, scans every compiled pattern. User-agent strings repeat heavily,
// so memoize the classification in a bounded LRU cache to keep the regex scan
// off the per-event hot path.
const CLASSIFY_CACHE_MAX = 10_000
const classifyCache = new LRUCache<string, BotClassification>({ max: CLASSIFY_CACHE_MAX })

// Single combined regex for the fast "is this anything at all?" test.
const COMBINED_REGEX = new RegExp(ALL_BOT_PATTERNS.map((pattern) => pattern.pattern).join('|'), 'i')

// Per-pattern compiled regexes for category lookup. Iterated in source order
// so first match wins — patterns are authored most-specific-first in patterns.ts.
const COMPILED_PATTERNS: ReadonlyArray<{ regex: RegExp; category: BotCategory; pattern: string }> =
  ALL_BOT_PATTERNS.map((pattern) => ({
    regex: new RegExp(pattern.pattern, 'i'),
    category: pattern.category,
    pattern: pattern.pattern,
  }))

/**
 * Classify a user-agent string. Returns the first matching bot pattern, or a
 * NON_BOT result if none match.
 *
 * Drop-in replacement for `isbot()` but additionally exposes the category
 * and the matched pattern source — useful for policy and metrics.
 */
export function classifyUA(userAgent: string | null | undefined): BotClassification {
  if (typeof userAgent !== 'string' || userAgent.length === 0) {
    return NON_BOT
  }

  const cached = classifyCache.get(userAgent)
  if (cached) {
    return cached
  }

  const result = computeClassification(userAgent)
  classifyCache.set(userAgent, result)
  return result
}

function computeClassification(userAgent: string): BotClassification {
  // Fast path: combined regex test. ~95% of legitimate traffic exits here.
  if (!COMBINED_REGEX.test(userAgent)) {
    return NON_BOT
  }
  for (const { regex, category, pattern } of COMPILED_PATTERNS) {
    if (regex.test(userAgent)) {
      return { isBot: true, category, matchedPattern: pattern }
    }
  }
  // Combined regex matched but no individual pattern did — should be unreachable.
  return { isBot: true, category: 'generic', matchedPattern: null }
}

/**
 * Boolean-only convenience for the (rare) caller that doesn't care about category.
 */
export function isBotUA(userAgent: string | null | undefined): boolean {
  return classifyUA(userAgent).isBot
}
