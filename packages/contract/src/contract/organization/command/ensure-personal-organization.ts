import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SOrganization } from '../schema.ts'

export const SOrganizationEnsurePersonalInput = v.strictObject({})
export type SOrganizationEnsurePersonalInput = v.InferOutput<
  typeof SOrganizationEnsurePersonalInput
>
export const SOrganizationEnsurePersonalOutput = SOrganization
export type SOrganizationEnsurePersonalOutput = v.InferOutput<
  typeof SOrganizationEnsurePersonalOutput
>

export const ensurePersonalOrganization = oc
  .route({ method: 'POST', path: '/ensurePersonalOrganization' })
  .meta({ auth: 'authenticated' })
  .errors({ ...ERead, CONFLICT: {} })
  .input(SOrganizationEnsurePersonalInput)
  .output(SOrganizationEnsurePersonalOutput)
