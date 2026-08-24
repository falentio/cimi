import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SGoal, SGoalDefinitionFields, SGoalIdentityFields } from '../schema.ts'

export const SGoalUpdateInput = v.strictObject(
  v.entriesFromObjects([SGoalIdentityFields, SGoalDefinitionFields]),
)
export type SGoalUpdateInput = v.InferOutput<typeof SGoalUpdateInput>
export const SGoalUpdateOutput = SGoal
export type SGoalUpdateOutput = v.InferOutput<typeof SGoalUpdateOutput>

export const updateGoal = oc
  .route({
    method: 'POST',
    path: '/updateGoal',
    operationId: 'updateGoal',
    summary: 'Update a goal',
    description: 'Update mutable fields of an existing Goal definition.',
    tags: ['goal'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    CONFLICT: { status: 409 },
  })
  .input(SGoalUpdateInput)
  .output(SGoalUpdateOutput)
