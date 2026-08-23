import { getTrafficBreakdowns } from './query/get-breakdowns.ts'
import { getTrafficOverview } from './query/get-overview.ts'

export const trafficReport = { getTrafficOverview, getTrafficBreakdowns }
