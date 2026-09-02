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
    path: '/site/getSite',
    operationId: 'getSite',
    summary: 'Get a site',
    description: 'Return one Site after persisted membership and Site ownership checks.',
    tags: ['site'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
    CONFLICT: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SSiteGetInput)
  .output(SSiteGetOutput)
