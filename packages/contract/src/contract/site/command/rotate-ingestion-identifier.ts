import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SSite, SSiteIdFields } from '../schema.ts'

export const SSiteRotateIngestionInput = SSiteIdFields
export type SSiteRotateIngestionInput = v.InferOutput<typeof SSiteRotateIngestionInput>
export const SSiteRotateIngestionOutput = SSite
export type SSiteRotateIngestionOutput = v.InferOutput<typeof SSiteRotateIngestionOutput>

export const rotateIngestionIdentifier = oc
  .route({
    method: 'POST',
    path: '/rotateIngestionIdentifier',
    operationId: 'rotateIngestionIdentifier',
    summary: 'Rotate ingestion identifier',
    description:
      'Revoke the current collection selector and issue a new non-secret Ingestion Identifier.',
    tags: ['site'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SSiteRotateIngestionInput)
  .output(SSiteRotateIngestionOutput)
