import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOrganization, SOrganizationNameFields } from '../schema.ts'

export const SOrganizationCreateInput = v.omit(SOrganizationNameFields, ['organizationId'])
export type SOrganizationCreateInput = v.InferOutput<typeof SOrganizationCreateInput>
export const SOrganizationCreateOutput = SOrganization
export type SOrganizationCreateOutput = v.InferOutput<typeof SOrganizationCreateOutput>

export const createOrganization = oc
  .route({
    method: 'POST',
    path: '/organization/createOrganization',
    operationId: 'createOrganization',
    summary: 'Create an organization',
    description: 'Create a collaborative Organization and its initial Owner membership.',
    tags: ['organization'],
    successStatus: 201,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    BAD_REQUEST: { status: 400 },
    CONFLICT: { status: 409 },
    INTERNAL_SERVER_ERROR: { status: 500 },
  })
  .input(SOrganizationCreateInput)
  .output(SOrganizationCreateOutput)
