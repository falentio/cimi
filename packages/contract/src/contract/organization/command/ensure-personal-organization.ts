import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
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
  .route({
    method: 'POST',
    path: '/organization/ensurePersonalOrganization',
    operationId: 'ensurePersonalOrganization',
    summary: 'Ensure personal organization',
    description: "Idempotently obtain the current user's Personal Organization.",
    tags: ['organization'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: {},
    CONFLICT: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SOrganizationEnsurePersonalInput)
  .output(SOrganizationEnsurePersonalOutput)
