import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SSite, SSiteIdFields } from '../schema.ts'

export const SSiteGetInput = SSiteIdFields
export type SSiteGetInput = v.InferOutput<typeof SSiteGetInput>
export const SSiteGetOutput = SSite
export type SSiteGetOutput = v.InferOutput<typeof SSiteGetOutput>

export const getSite = oc
  .route({
    method: 'GET',
    path: '/getSite',
    operationId: 'getSite',
    summary: 'Get a site',
    description: 'Return one Site after persisted membership and Site ownership checks.',
    tags: ['site'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
  })
  .input(SSiteGetInput)
  .output(SSiteGetOutput)
