import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SHelloBase } from '../schema.ts'

export const SHelloRemoveInput = v.pick(SHelloBase, ['id'])
export type SHelloRemoveInput = v.InferOutput<typeof SHelloRemoveInput>
export const SHelloRemoveOutput = SHelloRemoveInput
export type SHelloRemoveOutput = v.InferOutput<typeof SHelloRemoveOutput>

/**
 * Permanently removes a greeting owned by the authenticated User.
 *
 * @errors
 * - `BAD_REQUEST` — the identifier is invalid.
 * - `UNAUTHORIZED` — the caller is not authenticated.
 * - `NOT_FOUND` — the greeting is missing or owned by another User.
 */
export const remove = oc
  .route({
    method: 'POST',
    path: '/hello/remove',
    operationId: 'removeHello',
    summary: 'Remove a greeting',
    description: 'Permanently remove an owned greeting.',
    tags: ['hello'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    BAD_REQUEST: { status: 400 },
    UNAUTHORIZED: { status: 401 },
    NOT_FOUND: { status: 404 },
  })
  .input(SHelloRemoveInput)
  .output(SHelloRemoveOutput)
