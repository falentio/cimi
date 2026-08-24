import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SSite, SSiteOrganizationFields } from '../schema.ts'

export const SSiteCreateInput = SSiteOrganizationFields
export type SSiteCreateInput = v.InferOutput<typeof SSiteCreateInput>
export const SSiteCreateOutput = SSite
export type SSiteCreateOutput = v.InferOutput<typeof SSiteCreateOutput>

export const createSite = oc
  .route({
    method: 'POST',
    path: '/createSite',
    operationId: 'createSite',
    summary: 'Create a site',
    description:
      'Create a Site in an Organization and generate a fresh non-secret Ingestion Identifier.',
    tags: ['site'],
    successStatus: 201,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    CONFLICT: { status: 409 },
  })
  .input(SSiteCreateInput)
  .output(SSiteCreateOutput)
