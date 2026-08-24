import type { BotCategory } from './patterns.ts'

export interface BotClassification {
  isBot: boolean
  category: BotCategory | null
  matchedPattern: string | null
}

export const NON_BOT: BotClassification = { isBot: false, category: null, matchedPattern: null }
