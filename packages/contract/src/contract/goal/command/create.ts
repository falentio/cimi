import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SGoal, SGoalDefinitionFields, SGoalSiteFields } from '../schema.ts'

export const SGoalCreateInput = v.strictObject(
  v.entriesFromObjects([SGoalSiteFields, SGoalDefinitionFields]),
)
export type SGoalCreateInput = v.InferOutput<typeof SGoalCreateInput>
export const SGoalCreateOutput = SGoal
export type SGoalCreateOutput = v.InferOutput<typeof SGoalCreateOutput>

export const createGoal = oc
  .route({ method: 'POST', path: '/createGoal' })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SGoalCreateInput)
  .output(SGoalCreateOutput)
