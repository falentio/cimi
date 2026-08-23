import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SOrganizationIdentityFields } from '../schema.ts'

export const SOrganizationDeleteInput = SOrganizationIdentityFields
export type SOrganizationDeleteInput = v.InferOutput<typeof SOrganizationDeleteInput>
export const SOrganizationDeleteOutput = v.strictObject({ deleted: v.literal(true) })
export type SOrganizationDeleteOutput = v.InferOutput<typeof SOrganizationDeleteOutput>

export const deleteOrganization = oc
  .route({
    method: 'POST',
    path: '/deleteOrganization',
    operationId: 'deleteOrganization',
    summary: 'Delete an organization',
    description:
      'Delete an empty, non-personal Organization after the owner-only lifecycle checks pass.',
    tags: ['organization'],
  })
  .meta({ auth: 'admin' })
  .errors({
    ...ECommand,
    ORGANIZATION_NOT_EMPTY: { status: 409 },
    PERSONAL_ORGANIZATION_PROTECTED: { status: 409 },
  })
  .input(SOrganizationDeleteInput)
  .output(SOrganizationDeleteOutput)
