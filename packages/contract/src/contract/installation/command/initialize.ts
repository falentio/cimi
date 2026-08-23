import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SInstallation, SInstallationInitializeFields } from '../schema.ts'

export const SInstallationInitializeInput = SInstallationInitializeFields
export type SInstallationInitializeInput = v.InferOutput<typeof SInstallationInitializeInput>
export const SInstallationInitializeOutput = SInstallation
export type SInstallationInitializeOutput = v.InferOutput<typeof SInstallationInitializeOutput>

export const initializeInstallation = oc
  .route({ method: 'POST', path: '/initializeInstallation' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SInstallationInitializeInput)
  .output(SInstallationInitializeOutput)
