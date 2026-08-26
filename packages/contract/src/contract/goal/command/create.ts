import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SGoal, SGoalDefinitionFields, SGoalSiteFields } from '../schema.ts'

export const SGoalCreateInput = v.strictObject(
  v.entriesFromObjects([SGoalSiteFields, SGoalDefinitionFields]),
)
export type SGoalCreateInput = v.InferOutput<typeof SGoalCreateInput>
export const SGoalCreateOutput = SGoal
export type SGoalCreateOutput = v.InferOutput<typeof SGoalCreateOutput>

export const createGoal = oc
  .route({
    method: 'POST',
    path: '/goal/createGoal',
    operationId: 'createGoal',
    summary: 'Create a goal',
    description: 'Persist a validated single-action Goal definition for a Site.',
    tags: ['goal'],
    successStatus: 201,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
    CONFLICT: {},
  })
  .input(SGoalCreateInput)
  .output(SGoalCreateOutput)
