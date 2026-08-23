import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SOrganization, SOrganizationIdentityFields } from '../schema.ts'

export const SOrganizationGetInput = SOrganizationIdentityFields
export type SOrganizationGetInput = v.InferOutput<typeof SOrganizationGetInput>
export const SOrganizationGetOutput = SOrganization
export type SOrganizationGetOutput = v.InferOutput<typeof SOrganizationGetOutput>

export const getOrganization = oc
  .route({
    method: 'GET',
    path: '/getOrganization',
    operationId: 'getOrganization',
    summary: 'Get an organization',
    description: 'Return one Organization after persisted membership authorization.',
    tags: ['organization'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors(ERead)
  .input(SOrganizationGetInput)
  .output(SOrganizationGetOutput)
