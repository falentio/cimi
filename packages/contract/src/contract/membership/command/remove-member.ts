import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SMembershipTargetFields } from '../schema.ts'

export const SMembershipRemoveInput = SMembershipTargetFields
export type SMembershipRemoveInput = v.InferOutput<typeof SMembershipRemoveInput>
export const SMembershipRemoveOutput = v.strictObject({ removed: v.literal(true) })
export type SMembershipRemoveOutput = v.InferOutput<typeof SMembershipRemoveOutput>

export const removeMember = oc
  .route({ method: 'POST', path: '/removeMember' })
  .meta({ auth: 'admin' })
  .errors({ ...ECommand, OWNER_PROTECTED: {} })
  .input(SMembershipRemoveInput)
  .output(SMembershipRemoveOutput)
