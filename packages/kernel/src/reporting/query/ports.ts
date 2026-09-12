import type { PortResult } from '../../ports.ts'
import type {
  EventBreakdownQuery,
  EventBreakdownResult,
  EventBucketsQuery,
  EventBucketFacts,
  EventOverviewFacts,
  EventOverviewQuery,
  EventRowsQuery,
  EventRowsResult,
} from './event-types.ts'
import type {
  TrafficAggregateQuery,
  TrafficAggregateResult,
  TrafficBreakdownQuery,
  TrafficBreakdownResult,
} from './traffic-types.ts'

export interface ReportingQueryPort {
  trafficAggregate(query: TrafficAggregateQuery): PortResult<TrafficAggregateResult>
  trafficBreakdown(query: TrafficBreakdownQuery): PortResult<TrafficBreakdownResult>
  eventOverview(query: EventOverviewQuery): PortResult<EventOverviewFacts>
  eventBuckets(query: EventBucketsQuery): PortResult<readonly EventBucketFacts[]>
  eventRows(query: EventRowsQuery): PortResult<EventRowsResult>
  eventBreakdown(query: EventBreakdownQuery): PortResult<EventBreakdownResult>
}
