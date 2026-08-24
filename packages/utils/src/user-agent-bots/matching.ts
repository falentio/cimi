import { ALL_BOT_PATTERNS, type BotPattern } from './patterns.ts'

const UNSUPPORTED_SYNTAX = '()[]{}?+*|.^$'
const WORD_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789_'
export const ASCII_ALPHABET_SIZE = 128

export interface LiteralRule {
  kind: 'literal'
  sourceIndex: number
  pattern: string
  category: BotPattern['category']
  value: string
  startsWith: boolean
  endsWith: boolean
  wordBoundaryStart: boolean
  wordBoundaryEnd: boolean
}

export interface ComplexRule {
  kind: 'complex'
  sourceIndex: number
  pattern: string
  category: BotPattern['category']
  regex: RegExp
}

export type OrderedRule = LiteralRule | ComplexRule

export const ORDERED_RULES: OrderedRule[] = ALL_BOT_PATTERNS.map((pattern, sourceIndex) => {
  const literalRule = createLiteralRule(pattern, sourceIndex)
  return literalRule ?? createComplexRule(pattern, sourceIndex)
})

export const LITERAL_RULES = ORDERED_RULES.filter(
  (rule): rule is LiteralRule => rule.kind === 'literal',
)

export const COMPLEX_RULES = ORDERED_RULES.filter(
  (rule): rule is ComplexRule => rule.kind === 'complex',
)

export const FIRST_COMPLEX_SOURCE_INDEX = COMPLEX_RULES[0]?.sourceIndex ?? ORDERED_RULES.length

export const COMBINED_COMPLEX_REGEX = new RegExp(
  COMPLEX_RULES.map((rule) => rule.pattern).join('|'),
  'i',
)

export function normalizeAscii(value: string): string {
  return value.replace(/[A-Z]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 32))
}

export function matchesLiteralRule(userAgent: string, rule: LiteralRule): boolean {
  if (rule.startsWith && !userAgent.startsWith(rule.value)) {
    return false
  }

  let index = rule.startsWith ? 0 : userAgent.indexOf(rule.value)
  while (index !== -1) {
    if (matchesLiteralRuleAt(userAgent, rule, index)) {
      return true
    }

    if (rule.startsWith) {
      return false
    }
    index = userAgent.indexOf(rule.value, index + 1)
  }

  return false
}

export function matchesLiteralRuleAt(userAgent: string, rule: LiteralRule, index: number): boolean {
  const endIndex = index + rule.value.length
  if (
    index < 0 ||
    endIndex > userAgent.length ||
    (rule.startsWith && index !== 0) ||
    (rule.endsWith && endIndex !== userAgent.length)
  ) {
    return false
  }

  const startsAtWordBoundary = !rule.wordBoundaryStart || !isWordCharacter(userAgent[index - 1])
  const endsAtWordBoundary = !rule.wordBoundaryEnd || !isWordCharacter(userAgent[endIndex])
  return startsAtWordBoundary && endsAtWordBoundary
}

export function isEarliestLiteralRule(userAgent: string, candidate: LiteralRule): boolean {
  if (candidate.sourceIndex >= FIRST_COMPLEX_SOURCE_INDEX) {
    return false
  }

  for (const rule of LITERAL_RULES) {
    if (rule.sourceIndex >= candidate.sourceIndex) {
      break
    }
    if (matchesLiteralRule(userAgent, rule)) {
      return false
    }
  }

  return true
}

function createLiteralRule(
  { pattern, category }: BotPattern,
  sourceIndex: number,
): LiteralRule | undefined {
  let value = pattern
  let startsWith = false
  let endsWith = false
  let wordBoundaryStart = false
  let wordBoundaryEnd = false

  if (value.startsWith('^')) {
    startsWith = true
    value = value.slice(1)
  }
  if (value.endsWith('$')) {
    endsWith = true
    value = value.slice(0, -1)
  }
  if (value.startsWith('\\b')) {
    wordBoundaryStart = true
    value = value.slice(2)
  }
  if (value.endsWith('\\b')) {
    wordBoundaryEnd = true
    value = value.slice(0, -2)
  }

  if (
    value.length === 0 ||
    value.split('').some((character) => character.charCodeAt(0) >= ASCII_ALPHABET_SIZE) ||
    value.includes('\\') ||
    value.split('').some((character) => UNSUPPORTED_SYNTAX.includes(character))
  ) {
    return undefined
  }

  return {
    kind: 'literal',
    sourceIndex,
    pattern,
    category,
    value: normalizeAscii(value),
    startsWith,
    endsWith,
    wordBoundaryStart,
    wordBoundaryEnd,
  }
}

function createComplexRule({ pattern, category }: BotPattern, sourceIndex: number): ComplexRule {
  return {
    kind: 'complex',
    sourceIndex,
    pattern,
    category,
    regex: new RegExp(pattern, 'i'),
  }
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && WORD_CHARACTERS.includes(character)
}
