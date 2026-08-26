import './registrable-domain/psl.d.ts'

export { createSingleton } from './singleton/index.ts'
export {
  createIdGenerator,
  generateId,
  type EntityId,
  type IdGeneratorOptions,
} from './id/index.ts'
export {
  canonicalizeHostname,
  SHostname,
  SIanaTimezone,
  SId,
  SName,
  SWeekStart,
  type Hostname,
  type IanaTimezone,
  type Id,
  type Name,
  type WeekStart,
} from './schema/index.ts'
export {
  DEFAULT_RETENTION_POLICY,
  InMemoryAcceptanceJournalPort,
  InMemoryAnalyticsReadinessPort,
  InMemoryCollectionPolicyResolver,
  InMemoryLifecycleLock,
  InMemoryRetentionResolver,
  type AcceptanceJournalPort,
  type AnalyticsHealth,
  type AnalyticsReadinessPort,
  type CollectionPolicy,
  type CollectionPolicyResolver,
  type LifecycleLock,
  type LifecycleOperationKind,
  type PortResult,
  type RetentionPolicy,
  type RetentionResolver,
  type StoreHealth,
} from './ports/index.ts'
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
export {
  createEvent,
  EventEmitter,
  type EventEmitterOptions,
  type EventName,
  type UnlistenFn,
} from './event/index.ts'
