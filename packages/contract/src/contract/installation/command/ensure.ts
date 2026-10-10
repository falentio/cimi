import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SInstallation } from '../schema.ts'

export const SInstallationEnsureInput = v.strictObject({})

export type SInstallationEnsureInput = v.InferOutput<typeof SInstallationEnsureInput>

export const SInstallationEnsureOutput = SInstallation

export type SInstallationEnsureOutput = v.InferOutput<typeof SInstallationEnsureOutput>

export const ensureInstallation = oc
  .route({
    method: 'POST',
    path: '/installation/ensureInstallation',
    operationId: 'ensureInstallation',
    summary: 'Ensure installation',
    description:
      'Create the singleton installation row when it is absent, or return the existing row unchanged.',
    tags: ['installation'],
    successStatus: 200,
  })
  .meta({ auth: 'admin', admission: 'exempt' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    CONFLICT: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SInstallationEnsureInput)
  .output(SInstallationEnsureOutput)
