import type { PortResult } from '../../ports.ts'
import type { TrafficAggregateQuery, TrafficAggregateResult } from './traffic-types.ts'

export interface ReportingQueryPort {
  trafficAggregate(query: TrafficAggregateQuery): PortResult<TrafficAggregateResult>
}
