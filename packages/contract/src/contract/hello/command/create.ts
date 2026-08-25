import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SHelloBase } from '../schema.ts'

export const SHelloCreateInput = v.omit(SHelloBase, ['id', 'ownerId', 'createdAt'])
export type SHelloCreateInput = v.InferOutput<typeof SHelloCreateInput>
export const SHelloCreateOutput = SHelloBase
export type SHelloCreateOutput = v.InferOutput<typeof SHelloCreateOutput>

/**
 * Creates an immutable greeting owned by the authenticated User.
 *
 * @errors
 * - `BAD_REQUEST` — the name or message is invalid.
 * - `UNAUTHORIZED` — the caller is not authenticated.
 */
export const create = oc
  .route({
    method: 'POST',
    path: '/hello/create',
    operationId: 'createHello',
    summary: 'Create a greeting',
    description: 'Persist a new greeting for the authenticated User.',
    tags: ['hello'],
    successStatus: 201,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    BAD_REQUEST: { status: 400 },
    UNAUTHORIZED: { status: 401 },
  })
  .input(SHelloCreateInput)
  .output(SHelloCreateOutput)
