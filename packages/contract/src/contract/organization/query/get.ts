import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOrganization, SOrganizationIdentityFields } from '../schema.ts'

export const SOrganizationGetInput = SOrganizationIdentityFields
export type SOrganizationGetInput = v.InferOutput<typeof SOrganizationGetInput>
export const SOrganizationGetOutput = SOrganization
export type SOrganizationGetOutput = v.InferOutput<typeof SOrganizationGetOutput>

export const getOrganization = oc
  .route({
    method: 'GET',
    path: '/organization/getOrganization',
    operationId: 'getOrganization',
    summary: 'Get an organization',
    description: 'Return one Organization after persisted membership authorization.',
    tags: ['organization'],
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
  .input(SOrganizationGetInput)
  .output(SOrganizationGetOutput)
