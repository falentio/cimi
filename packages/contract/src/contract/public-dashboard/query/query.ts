import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SDate, SReportFreshness } from '../../../schema/index.ts'
import {
  MAX_PUBLIC_DASHBOARD_DIMENSION_ROWS,
  MAX_PUBLIC_DASHBOARD_INTERVAL_STARTS,
  SPublicDashboardDimensionBucket,
  SPublicDashboardQueryFields,
  SPublicDashboardTimeBucket,
} from '../schema.ts'

export const SPublicDashboardQueryInput = SPublicDashboardQueryFields
export type SPublicDashboardQueryInput = v.InferOutput<typeof SPublicDashboardQueryInput>
export const SPublicDashboardQueryOutput = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      fromDate: SDate,
      toDate: SDate,
      buckets: v.union([
        v.pipe(
          v.array(SPublicDashboardTimeBucket),
          v.maxLength(MAX_PUBLIC_DASHBOARD_INTERVAL_STARTS),
        ),
        v.pipe(
          v.array(SPublicDashboardDimensionBucket),
          v.maxLength(MAX_PUBLIC_DASHBOARD_DIMENSION_ROWS),
        ),
      ]),
    }),
    SReportFreshness,
  ]),
)
export type SPublicDashboardQueryOutput = v.InferOutput<typeof SPublicDashboardQueryOutput>

export const queryPublicDashboard = oc
  .route({
    method: 'GET',
    path: '/public-dashboard/queryPublicDashboard',
    operationId: 'queryPublicDashboard',
    summary: 'Query public dashboard',
    description:
      'Return approved aggregate dashboard analytics using the current public identifier.',
    tags: ['public-dashboard'],
    successStatus: 200,
  })
  .meta({ auth: 'public' })
  .errors({
    BAD_REQUEST: {},
    NOT_FOUND: {},
    SERVICE_UNAVAILABLE: {},
    TOO_MANY_REQUESTS: {},
    QUERY_LIMIT_EXCEEDED: {},
  })
  .input(SPublicDashboardQueryInput)
  .output(SPublicDashboardQueryOutput)
