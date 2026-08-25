import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import {
  DEFAULT_RETENTION_POLICY,
  SInstallation,
  SInstallationInitializeFields,
} from '../schema.ts'

export const SInstallationInitializeInput = SInstallationInitializeFields
export type SInstallationInitializeInput = v.InferOutput<typeof SInstallationInitializeInput>

export { DEFAULT_RETENTION_POLICY }

const SInstallationInitializeCreatedOutput = v.strictObject({
  status: v.literal(201),
  body: SInstallation,
})
const SInstallationInitializeReusedOutput = v.strictObject({
  status: v.literal(200),
  body: SInstallation,
})
export const SInstallationInitializeOutput = v.union([
  SInstallationInitializeCreatedOutput,
  SInstallationInitializeReusedOutput,
])
export type SInstallationInitializeOutput = v.InferOutput<typeof SInstallationInitializeOutput>

export const initializeInstallation = oc
  .route({
    method: 'POST',
    path: '/installation/initializeInstallation',
    operationId: 'initializeInstallation',
    summary: 'Initialize installation',
    description:
      'Establish installation metadata and defaults, or return the existing installation state. First initialization returns 201; convergent reuse returns 200.',
    tags: ['installation'],
    outputStructure: 'detailed',
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    CONFLICT: { status: 409 },
    INTERNAL_SERVER_ERROR: { status: 500 },
  })
  .input(SInstallationInitializeInput)
  .output(SInstallationInitializeOutput)
