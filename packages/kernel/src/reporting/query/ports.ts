import type { PortResult } from '../../ports.ts'
import type {
  TrafficAggregateQuery,
  TrafficAggregateResult,
  TrafficBreakdownQuery,
  TrafficBreakdownResult,
} from './traffic-types.ts'

export interface ReportingQueryPort {
  trafficAggregate(query: TrafficAggregateQuery): PortResult<TrafficAggregateResult>
  trafficBreakdown(query: TrafficBreakdownQuery): PortResult<TrafficBreakdownResult>
}
