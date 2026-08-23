import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SPublicDashboardConfig, SPublicDashboardSiteFields } from '../schema.ts'

export const SPublicDashboardEnableInput = SPublicDashboardSiteFields
export type SPublicDashboardEnableInput = v.InferOutput<typeof SPublicDashboardEnableInput>
export const SPublicDashboardEnableOutput = SPublicDashboardConfig
export type SPublicDashboardEnableOutput = v.InferOutput<typeof SPublicDashboardEnableOutput>

export const enablePublicDashboard = oc
  .route({
    method: 'POST',
    path: '/enablePublicDashboard',
    operationId: 'enablePublicDashboard',
    summary: 'Enable public dashboard',
    description: 'Enable public aggregate access and return the rotated dashboard identifier.',
    tags: ['public-dashboard'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SPublicDashboardEnableInput)
  .output(SPublicDashboardEnableOutput)
