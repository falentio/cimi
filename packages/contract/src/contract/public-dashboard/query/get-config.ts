import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery } from '../../../schema/index.ts'
import { SPublicDashboardConfig, SPublicDashboardSiteFields } from '../schema.ts'

export const SPublicDashboardConfigInput = SPublicDashboardSiteFields
export type SPublicDashboardConfigInput = v.InferOutput<typeof SPublicDashboardConfigInput>
export const SPublicDashboardConfigOutput = SPublicDashboardConfig
export type SPublicDashboardConfigOutput = v.InferOutput<typeof SPublicDashboardConfigOutput>

export const getPublicDashboardConfig = oc
  .route({ method: 'GET', path: '/getPublicDashboardConfig' })
  .meta({ auth: 'admin' })
  .errors(EQuery)
  .input(SPublicDashboardConfigInput)
  .output(SPublicDashboardConfigOutput)
