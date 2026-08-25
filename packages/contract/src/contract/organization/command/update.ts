import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOrganization, SOrganizationNameFields } from '../schema.ts'

export const SOrganizationUpdateInput = SOrganizationNameFields
export type SOrganizationUpdateInput = v.InferOutput<typeof SOrganizationUpdateInput>
export const SOrganizationUpdateOutput = SOrganization
export type SOrganizationUpdateOutput = v.InferOutput<typeof SOrganizationUpdateOutput>

export const updateOrganization = oc
  .route({
    method: 'POST',
    path: '/organization/updateOrganization',
    operationId: 'updateOrganization',
    summary: 'Update an organization',
    description: 'Update mutable metadata for an authorized Organization.',
    tags: ['organization'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
  })
  .input(SOrganizationUpdateInput)
  .output(SOrganizationUpdateOutput)
