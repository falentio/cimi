export * as schema from './schema.ts'
export { contract } from './contract.ts'
export {
  ERRORS,
  ERROR_CATALOG,
  getErrorDefinition,
  toORPCErrorMap,
  type ContractErrorCode,
  type ContractErrorDefinition,
} from './schema/errors.ts'
export { SSystemHealthOutput } from './contract/health/query/health.ts'
export {
  EVENT_ACCEPTANCE_FLUSH_MAX_EVENTS,
  EVENT_ACCEPTANCE_PENDING_MAX_EVENTS,
  EVENT_ACCEPTANCE_WINDOW_MS,
} from './contract/event-ingestion/acceptance.ts'
