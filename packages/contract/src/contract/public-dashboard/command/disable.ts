import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SPublicDashboardSiteFields } from '../schema.ts'

export const SPublicDashboardDisableInput = SPublicDashboardSiteFields
export type SPublicDashboardDisableInput = v.InferOutput<typeof SPublicDashboardDisableInput>
export const SPublicDashboardDisableOutput = v.void()
export type SPublicDashboardDisableOutput = v.InferOutput<typeof SPublicDashboardDisableOutput>

export const disablePublicDashboard = oc
  .route({
    method: 'POST',
    path: '/disablePublicDashboard',
    operationId: 'disablePublicDashboard',
    summary: 'Disable public dashboard',
    description: 'Disable public aggregate access and invalidate the current dashboard identifier.',
    tags: ['public-dashboard'],
    successStatus: 204,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
  })
  .input(SPublicDashboardDisableInput)
  .output(SPublicDashboardDisableOutput)
