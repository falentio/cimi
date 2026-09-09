import { COLLECT_EVENT_MAX_RAW_REQUEST_BYTES, collectEvent } from './command/collect-event.ts'
import { COLLECT_EVENTS_MAX_RAW_REQUEST_BYTES, collectEvents } from './command/collect-events.ts'

export const eventIngestion = { collectEvent, collectEvents }

export const EVENT_RAW_REQUEST_LIMITS: Readonly<Record<string, number>> = {
  [collectEvent['~orpc'].route.path!]: COLLECT_EVENT_MAX_RAW_REQUEST_BYTES,
  [collectEvents['~orpc'].route.path!]: COLLECT_EVENTS_MAX_RAW_REQUEST_BYTES,
}
