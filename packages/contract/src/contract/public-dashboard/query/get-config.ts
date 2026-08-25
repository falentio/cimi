import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SPublicDashboardConfig, SPublicDashboardSiteFields } from '../schema.ts'

export const SPublicDashboardConfigInput = SPublicDashboardSiteFields
export type SPublicDashboardConfigInput = v.InferOutput<typeof SPublicDashboardConfigInput>
export const SPublicDashboardConfigOutput = SPublicDashboardConfig
export type SPublicDashboardConfigOutput = v.InferOutput<typeof SPublicDashboardConfigOutput>

export const getPublicDashboardConfig = oc
  .route({
    method: 'GET',
    path: '/public-dashboard/getPublicDashboardConfig',
    operationId: 'getPublicDashboardConfig',
    summary: 'Get public dashboard config',
    description: 'Return public dashboard status and identifier metadata for authorized operators.',
    tags: ['public-dashboard'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
  })
  .input(SPublicDashboardConfigInput)
  .output(SPublicDashboardConfigOutput)
