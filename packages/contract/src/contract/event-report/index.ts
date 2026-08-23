import { getEventBreakdowns } from './query/get-breakdowns.ts'
import { getEventOverview } from './query/get-overview.ts'
import { getEventTimeseries } from './query/get-timeseries.ts'
import { listEvents } from './query/list.ts'

export const eventReport = { getEventOverview, getEventTimeseries, listEvents, getEventBreakdowns }
