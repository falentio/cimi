import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SInstallation } from '../schema.ts'

export const SInstallationStatusInput = v.strictObject({})
export type SInstallationStatusInput = v.InferOutput<typeof SInstallationStatusInput>
export const SInstallationStatusOutput = SInstallation
export type SInstallationStatusOutput = v.InferOutput<typeof SInstallationStatusOutput>

export const getInstallationStatus = oc
  .route({ method: 'GET', path: '/getInstallationStatus' })
  .meta({ auth: 'admin' })
  .errors(ERead)
  .input(SInstallationStatusInput)
  .output(SInstallationStatusOutput)
