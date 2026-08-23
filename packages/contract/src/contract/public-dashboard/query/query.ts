import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SDateTime } from '../../../schema/index.ts'
import { SPublicDashboardBucket, SPublicDashboardQueryFields } from '../schema.ts'

export const SPublicDashboardQueryInput = SPublicDashboardQueryFields
export type SPublicDashboardQueryInput = v.InferOutput<typeof SPublicDashboardQueryInput>
export const SPublicDashboardQueryOutput = v.strictObject({
  from: SDateTime,
  to: SDateTime,
  buckets: v.array(SPublicDashboardBucket),
})
export type SPublicDashboardQueryOutput = v.InferOutput<typeof SPublicDashboardQueryOutput>

export const queryPublicDashboard = oc
  .route({
    method: 'GET',
    path: '/queryPublicDashboard',
    operationId: 'queryPublicDashboard',
    summary: 'Query public dashboard',
    description:
      'Return approved aggregate dashboard analytics using the current public identifier.',
    tags: ['public-dashboard'],
    successStatus: 200,
  })
  .meta({ auth: 'public' })
  .errors({
    BAD_REQUEST: { status: 400 },
    NOT_FOUND: { status: 404 },
    TOO_MANY_REQUESTS: { status: 429 },
    QUERY_LIMIT_EXCEEDED: { status: 422 },
  })
  .input(SPublicDashboardQueryInput)
  .output(SPublicDashboardQueryOutput)
