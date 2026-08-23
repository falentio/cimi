import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
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
  .errors(ECommand)
  .input(SPublicDashboardDisableInput)
  .output(SPublicDashboardDisableOutput)
