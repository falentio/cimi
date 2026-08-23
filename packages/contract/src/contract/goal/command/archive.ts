import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SGoalIdentityFields } from '../schema.ts'

export const SGoalArchiveInput = SGoalIdentityFields
export type SGoalArchiveInput = v.InferOutput<typeof SGoalArchiveInput>
export const SGoalArchiveOutput = v.strictObject({ archived: v.literal(true) })
export type SGoalArchiveOutput = v.InferOutput<typeof SGoalArchiveOutput>

export const archiveGoal = oc
  .route({ method: 'POST', path: '/archiveGoal' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SGoalArchiveInput)
  .output(SGoalArchiveOutput)
