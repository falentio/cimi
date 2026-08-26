import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOrganizationIdentityFields } from '../schema.ts'

export const SOrganizationDeleteInput = SOrganizationIdentityFields
export type SOrganizationDeleteInput = v.InferOutput<typeof SOrganizationDeleteInput>
export const SOrganizationDeleteOutput = v.void()
export type SOrganizationDeleteOutput = v.InferOutput<typeof SOrganizationDeleteOutput>

export const deleteOrganization = oc
  .route({
    method: 'POST',
    path: '/organization/deleteOrganization',
    operationId: 'deleteOrganization',
    summary: 'Delete an organization',
    description:
      'Delete an empty Organization, including a Personal Organization, after owner-only lifecycle checks pass.',
    tags: ['organization'],
    successStatus: 204,
  })
  .meta({ auth: 'owner' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    ORGANIZATION_NOT_EMPTY: {},
    PERSONAL_ORGANIZATION_PROTECTED: {},
  })
  .input(SOrganizationDeleteInput)
  .output(SOrganizationDeleteOutput)
