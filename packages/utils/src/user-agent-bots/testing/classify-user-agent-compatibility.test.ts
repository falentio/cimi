import { describe, expect, it } from 'vitest'

import { classifyUAAhoDense } from '../aho-dense.ts'
import { ALL_BOT_PATTERNS } from '../patterns.ts'
import { COMPLEX_RULES, LITERAL_RULES, type LiteralRule } from '../matching.ts'
import { classifyUA as classifyUAPublic } from '../../index.ts'
import { NON_BOT, type BotClassification } from '../types.ts'

const COMPLEX_PATTERN_PROBES: Record<string, string> = {
  ' daum[ /]': 'Mozilla daum/1',
  '(?:^|[^g])news(?!sapphire)': 'news!',
  '(?<! (?:channel/|google/))google(?!(app|/google| pixel))': 'googlebot',
  '(?<! cu)bots?(?:\\b|_)': 'bots',
  '(?<!(?:lib))http': 'http',
  '(?<!cam)scan': 'scan',
  '@[a-z][\\w-]+\\.': 'contact@example.com',
  '\\(\\)': '()',
  '\\.com\\b': 'example.com',
  '\\b\\w+\\.ai': 'example.ai',
  '\\|': '|',
  '^[\\w \\.\\-\\(?:\\):%]+(?:/v?\\d+(?:\\.\\d+)?(?:\\.\\d{1,10})*?)?(?:,|$)': 'Client/1.2',
  '^[\\w\\-]+/[\\w]+$': 'Client/abc',
  '^[^ ]{50,}$': '!'.repeat(50),
  '^\\d+\\b': '123!',
  '^\\W': '!',
  '^\\w*search\\b': 'search!',
  '^\\w+/[\\w\\(\\)]*$': 'client/a(b)',
  '^\\w+/\\d\\.\\d\\s\\([\\w@]+\\)$': 'client/1.2 (user)',
  '^clamav[ /]': 'clamav/1 extra',
  '^ddg[_-]android': 'ddg-android!',
  '^dispatch/\\d': 'dispatch/1 extra',
  '^mozilla/\\d\\.\\d\\s[\\w\\.-]+$': 'mozilla/5.0 Firefox',
  '^mozilla/\\d\\.\\d\\s\\((?:compatible;)?(?:\\s?[\\w\\d-.]+\\/\\d+\\.\\d+)?\\)$':
    'mozilla/5.0 (compatible;)',
  '^zdm/\\d': 'zdm/1 extra',
  'bit\\.ly/': 'bit.ly/',
  'java(?!;)': 'java!',
  'mail\\.ru/': 'mail.ru/',
  'ptst[ /]\\d': 'ptst/1 extra',
}

describe('dense Aho-Corasick compatibility', () => {
  it('covers every literal-safe pattern', () => {
    for (const rule of LITERAL_RULES) {
      const userAgent = literalProbe(rule)
      expect(new RegExp(rule.pattern, 'i').test(userAgent), rule.pattern).toBe(true)
      expect(classifyUAAhoDense(userAgent), rule.pattern).toEqual(regexOracle(userAgent))
      expect(classifyUAPublic(userAgent), rule.pattern).toEqual(classifyUAAhoDense(userAgent))
      expect(classifyUAAhoDense(userAgent.toUpperCase()), rule.pattern).toEqual(
        regexOracle(userAgent.toUpperCase()),
      )
    }
  })

  it('covers every complex pattern with an independent probe', () => {
    expect(Object.keys(COMPLEX_PATTERN_PROBES).sort()).toEqual(
      COMPLEX_RULES.map((rule) => rule.pattern).sort(),
    )

    for (const rule of COMPLEX_RULES) {
      const userAgent = COMPLEX_PATTERN_PROBES[rule.pattern]
      expect(userAgent, rule.pattern).toBeDefined()
      expect(new RegExp(rule.pattern, 'i').test(userAgent!), rule.pattern).toBe(true)
      expect(classifyUAAhoDense(userAgent!), rule.pattern).toEqual(regexOracle(userAgent!))
      expect(classifyUAPublic(userAgent!), rule.pattern).toEqual(classifyUAAhoDense(userAgent!))
    }
  })
})

function literalProbe(rule: LiteralRule): string {
  const prefix = rule.startsWith ? '' : rule.wordBoundaryStart ? 'probe ' : 'prefix '
  const suffix = rule.endsWith ? '' : rule.wordBoundaryEnd ? '!' : ' suffix'
  return `${prefix}${rule.value}${suffix}`
}

function regexOracle(userAgent: string | null | undefined): BotClassification {
  if (typeof userAgent !== 'string' || userAgent.length === 0) {
    return NON_BOT
  }

  for (const { pattern, category } of ALL_BOT_PATTERNS) {
    if (new RegExp(pattern, 'i').test(userAgent)) {
      return { isBot: true, category, matchedPattern: pattern }
    }
  }

  return NON_BOT
}
