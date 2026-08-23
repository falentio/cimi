import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead, SDateTime } from '../../../schema/index.ts'
import { SProfileIdentityFields, SProfileStatus } from '../schema.ts'

export const SDeletionStatusInput = SProfileIdentityFields
export type SDeletionStatusInput = v.InferOutput<typeof SDeletionStatusInput>
export const SDeletionStatusOutput = v.strictObject({
  status: SProfileStatus,
  updatedAt: SDateTime,
})
export type SDeletionStatusOutput = v.InferOutput<typeof SDeletionStatusOutput>

export const getDeletionStatus = oc
  .route({ method: 'GET', path: '/getDeletionStatus' })
  .meta({ auth: 'authenticated' })
  .errors(ERead)
  .input(SDeletionStatusInput)
  .output(SDeletionStatusOutput)
