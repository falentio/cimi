import './registrable-domain/psl.d.ts'

export { createSingleton } from './singleton/index.ts'
export { generateId, type EntityId } from './id/index.ts'
export {
  createIpMatcher,
  parseIpPattern,
  type IpFamily,
  type IpMatcher,
  type IpPatternKind,
  type ParsedIpPattern,
} from './ip/index.ts'
export {
  createUserAgentParser,
  parseUserAgent,
  type ParsedUserAgent,
  type UserAgentParser,
  type UserAgentParserOptions,
} from './user-agent/index.ts'
export { getRegistrableDomain } from './registrable-domain/index.ts'
export {
  classifyUA,
  isBotUA,
  type BotCategory,
  type BotClassification,
} from './user-agent-bots/index.ts'
