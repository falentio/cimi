import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SOrganization, SOrganizationNameFields } from '../schema.ts'

export const SOrganizationCreateInput = v.omit(SOrganizationNameFields, ['organizationId'])
export type SOrganizationCreateInput = v.InferOutput<typeof SOrganizationCreateInput>
export const SOrganizationCreateOutput = SOrganization
export type SOrganizationCreateOutput = v.InferOutput<typeof SOrganizationCreateOutput>

export const createOrganization = oc
  .route({ method: 'POST', path: '/createOrganization' })
  .meta({ auth: 'authenticated' })
  .errors(ECommand)
  .input(SOrganizationCreateInput)
  .output(SOrganizationCreateOutput)
