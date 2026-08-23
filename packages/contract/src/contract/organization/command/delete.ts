import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SOrganizationIdentityFields } from '../schema.ts'

export const SOrganizationDeleteInput = SOrganizationIdentityFields
export type SOrganizationDeleteInput = v.InferOutput<typeof SOrganizationDeleteInput>
export const SOrganizationDeleteOutput = v.strictObject({ deleted: v.literal(true) })
export type SOrganizationDeleteOutput = v.InferOutput<typeof SOrganizationDeleteOutput>

export const deleteOrganization = oc
  .route({ method: 'POST', path: '/deleteOrganization' })
  .meta({ auth: 'admin' })
  .errors({ ...ECommand, ORGANIZATION_NOT_EMPTY: {}, PERSONAL_ORGANIZATION_PROTECTED: {} })
  .input(SOrganizationDeleteInput)
  .output(SOrganizationDeleteOutput)
