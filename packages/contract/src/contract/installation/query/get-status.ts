import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SInstallation } from '../schema.ts'

export const SInstallationStatusInput = v.strictObject({})
export type SInstallationStatusInput = v.InferOutput<typeof SInstallationStatusInput>
export const SInstallationStatusOutput = SInstallation
export type SInstallationStatusOutput = v.InferOutput<typeof SInstallationStatusOutput>

export const getInstallationStatus = oc
  .route({
    method: 'GET',
    path: '/installation/getInstallationStatus',
    operationId: 'getInstallationStatus',
    summary: 'Get installation status',
    description: 'Return installation readiness and maintenance state.',
    tags: ['installation'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    INTERNAL_SERVER_ERROR: { status: 500 },
  })
  .input(SInstallationStatusInput)
  .output(SInstallationStatusOutput)
