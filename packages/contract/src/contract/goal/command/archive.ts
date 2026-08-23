import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SGoalIdentityFields } from '../schema.ts'

export const SGoalArchiveInput = SGoalIdentityFields
export type SGoalArchiveInput = v.InferOutput<typeof SGoalArchiveInput>
export const SGoalArchiveOutput = v.void()
export type SGoalArchiveOutput = v.InferOutput<typeof SGoalArchiveOutput>

export const archiveGoal = oc
  .route({
    method: 'POST',
    path: '/archiveGoal',
    operationId: 'archiveGoal',
    summary: 'Archive a goal',
    description: 'Archive a Goal definition while preserving its historical meaning.',
    tags: ['goal'],
    successStatus: 204,
  })
  .meta({ auth: 'admin' })
  .errors(ECommand)
  .input(SGoalArchiveInput)
  .output(SGoalArchiveOutput)
