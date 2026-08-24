import { LRUCache } from 'lru-cache'

import {
  COMBINED_COMPLEX_REGEX,
  COMPLEX_RULES,
  LITERAL_RULES,
  isEarliestLiteralRule,
  matchesLiteralRule,
  matchesLiteralRuleAt,
  type LiteralRule,
} from './matching.ts'
import { NON_BOT, type BotClassification } from './types.ts'

const CLASSIFY_CACHE_MAX = 10_000
const ASCII_ALPHABET_SIZE = 128
const HOT_LITERAL_RULES = LITERAL_RULES.filter((rule) => rule.sourceIndex < 8)
const classifyCache = new LRUCache<string, BotClassification>({ max: CLASSIFY_CACHE_MAX })

interface SparseNode {
  transitions: Map<string, number>
  failure: number
  outputs: LiteralRule[]
}

interface DenseAutomaton {
  transitions: Uint16Array
  outputs: LiteralRule[][]
}

const AUTOMATON = buildAutomaton(LITERAL_RULES)

/**
 * Primary matcher using a packed Aho-Corasick transition table for literal-safe
 * patterns and regex fallback for complex patterns.
 */
export function classifyUAAhoDense(userAgent: string | null | undefined): BotClassification {
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

export function isBotUAAhoDense(userAgent: string | null | undefined): boolean {
  return classifyUAAhoDense(userAgent).isBot
}

function computeClassification(userAgent: string): BotClassification {
  const normalizedUserAgent = userAgent.toLowerCase()
  const hotLiteralRule = findHotLiteralRule(normalizedUserAgent)
  if (hotLiteralRule) {
    return classificationFor(hotLiteralRule)
  }

  const literalRule = findFirstLiteralRule(normalizedUserAgent)

  if (literalRule?.sourceIndex === 0) {
    return classificationFor(literalRule)
  }

  if (!COMBINED_COMPLEX_REGEX.test(userAgent)) {
    return literalRule ? classificationFor(literalRule) : NON_BOT
  }

  for (const rule of COMPLEX_RULES) {
    if (literalRule && rule.sourceIndex > literalRule.sourceIndex) {
      break
    }
    if (rule.regex.test(userAgent)) {
      return classificationFor(rule)
    }
  }

  return literalRule ? classificationFor(literalRule) : NON_BOT
}

function findHotLiteralRule(userAgent: string): LiteralRule | undefined {
  if (
    !userAgent.includes('bot') &&
    !userAgent.startsWith('openai/') &&
    !userAgent.startsWith('claude-code/')
  ) {
    return undefined
  }

  for (const rule of HOT_LITERAL_RULES) {
    if (matchesLiteralRule(userAgent, rule)) {
      return rule
    }
  }

  return undefined
}

function findFirstLiteralRule(userAgent: string): LiteralRule | undefined {
  let state = 0
  let bestRule: LiteralRule | undefined

  for (let index = 0; index < userAgent.length; index += 1) {
    const code = userAgent.charCodeAt(index)
    state =
      code < ASCII_ALPHABET_SIZE ? AUTOMATON.transitions[state * ASCII_ALPHABET_SIZE + code]! : 0

    for (const rule of AUTOMATON.outputs[state]!) {
      const startIndex = index + 1 - rule.value.length
      if (
        matchesLiteralRuleAt(userAgent, rule, startIndex) &&
        (bestRule === undefined || rule.sourceIndex < bestRule.sourceIndex)
      ) {
        bestRule = rule
        if (isEarliestLiteralRule(userAgent, bestRule)) {
          return bestRule
        }
      }
    }
  }

  return bestRule
}

function buildAutomaton(rules: LiteralRule[]): DenseAutomaton {
  const nodes: SparseNode[] = [createNode()]

  for (const rule of rules) {
    let state = 0
    for (const character of rule.value) {
      const currentNode = nodes[state]!
      const nextState = currentNode.transitions.get(character)
      if (nextState !== undefined) {
        state = nextState
        continue
      }

      const createdState = nodes.length
      currentNode.transitions.set(character, createdState)
      nodes.push(createNode())
      state = createdState
    }
    nodes[state]!.outputs.push(rule)
  }

  const breadthFirstOrder = [0]
  const queue: number[] = []
  for (const childState of nodes[0]!.transitions.values()) {
    queue.push(childState)
    breadthFirstOrder.push(childState)
  }

  let queueIndex = 0
  while (queueIndex < queue.length) {
    const state = queue[queueIndex++]!
    const currentNode = nodes[state]!
    for (const [character, childState] of currentNode.transitions) {
      let failureState = currentNode.failure
      while (failureState !== 0 && !nodes[failureState]!.transitions.has(character)) {
        failureState = nodes[failureState]!.failure
      }

      nodes[childState]!.failure = nodes[failureState]!.transitions.get(character) ?? 0
      for (const rule of nodes[nodes[childState]!.failure]!.outputs) {
        nodes[childState]!.outputs.push(rule)
      }
      queue.push(childState)
      breadthFirstOrder.push(childState)
    }
  }

  if (nodes.length > 65_535) {
    throw new Error('Aho-Corasick automaton exceeds the dense state limit')
  }

  const transitions = new Uint16Array(nodes.length * ASCII_ALPHABET_SIZE)
  for (const state of breadthFirstOrder) {
    const node = nodes[state]!
    for (let code = 0; code < ASCII_ALPHABET_SIZE; code += 1) {
      const character = String.fromCharCode(code)
      const directState = node.transitions.get(character)
      transitions[state * ASCII_ALPHABET_SIZE + code] =
        directState ?? (state === 0 ? 0 : transitions[node.failure * ASCII_ALPHABET_SIZE + code]!)
    }
  }

  return {
    transitions,
    outputs: nodes.map((node) => node.outputs),
  }
}

function createNode(): SparseNode {
  return { transitions: new Map(), failure: 0, outputs: [] }
}

function classificationFor(rule: {
  category: LiteralRule['category']
  pattern: string
}): BotClassification {
  return { isBot: true, category: rule.category, matchedPattern: rule.pattern }
}
