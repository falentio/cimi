import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SPublicDashboardConfig, SPublicDashboardSiteFields } from '../schema.ts'

export const SPublicDashboardEnableInput = SPublicDashboardSiteFields
export type SPublicDashboardEnableInput = v.InferOutput<typeof SPublicDashboardEnableInput>
export const SPublicDashboardEnableOutput = SPublicDashboardConfig
export type SPublicDashboardEnableOutput = v.InferOutput<typeof SPublicDashboardEnableOutput>

export const enablePublicDashboard = oc
  .route({ method: 'POST', path: '/enablePublicDashboard' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SPublicDashboardEnableInput)
  .output(SPublicDashboardEnableOutput)
