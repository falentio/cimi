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
  .route({ method: 'GET', path: '/queryPublicDashboard' })
  .meta({ auth: 'public' })
  .errors({ BAD_REQUEST: {}, NOT_FOUND: {}, TOO_MANY_REQUESTS: {}, QUERY_LIMIT_EXCEEDED: {} })
  .input(SPublicDashboardQueryInput)
  .output(SPublicDashboardQueryOutput)
