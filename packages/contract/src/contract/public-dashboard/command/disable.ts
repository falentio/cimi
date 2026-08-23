import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SPublicDashboardSiteFields } from '../schema.ts'

export const SPublicDashboardDisableInput = SPublicDashboardSiteFields
export type SPublicDashboardDisableInput = v.InferOutput<typeof SPublicDashboardDisableInput>
export const SPublicDashboardDisableOutput = v.strictObject({ disabled: v.literal(true) })
export type SPublicDashboardDisableOutput = v.InferOutput<typeof SPublicDashboardDisableOutput>

export const disablePublicDashboard = oc
  .route({ method: 'POST', path: '/disablePublicDashboard' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SPublicDashboardDisableInput)
  .output(SPublicDashboardDisableOutput)
