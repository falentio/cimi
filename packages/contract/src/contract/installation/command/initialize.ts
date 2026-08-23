import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SInstallation, SInstallationInitializeFields } from '../schema.ts'

export const SInstallationInitializeInput = SInstallationInitializeFields
export type SInstallationInitializeInput = v.InferOutput<typeof SInstallationInitializeInput>

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
    path: '/initializeInstallation',
    operationId: 'initializeInstallation',
    summary: 'Initialize installation',
    description:
      'Establish installation metadata and defaults, or return the existing installation state. First initialization returns 201; convergent reuse returns 200.',
    tags: ['installation'],
    outputStructure: 'detailed',
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SInstallationInitializeInput)
  .output(SInstallationInitializeOutput)
