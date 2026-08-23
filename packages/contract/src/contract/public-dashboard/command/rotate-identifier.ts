import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SPublicDashboardConfig, SPublicDashboardSiteFields } from '../schema.ts'

export const SPublicDashboardRotateInput = SPublicDashboardSiteFields
export type SPublicDashboardRotateInput = v.InferOutput<typeof SPublicDashboardRotateInput>
export const SPublicDashboardRotateOutput = SPublicDashboardConfig
export type SPublicDashboardRotateOutput = v.InferOutput<typeof SPublicDashboardRotateOutput>

export const rotatePublicDashboardIdentifier = oc
  .route({ method: 'POST', path: '/rotatePublicDashboardIdentifier' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SPublicDashboardRotateInput)
  .output(SPublicDashboardRotateOutput)
