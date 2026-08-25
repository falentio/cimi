import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SHelloBase } from '../schema.ts'

export const SHelloGetInput = v.pick(SHelloBase, ['id'])
export type SHelloGetInput = v.InferOutput<typeof SHelloGetInput>
export const SHelloGetOutput = SHelloBase
export type SHelloGetOutput = v.InferOutput<typeof SHelloGetOutput>

/**
 * Returns one greeting by its opaque identifier.
 *
 * @errors
 * - `BAD_REQUEST` — the identifier is invalid.
 * - `NOT_FOUND` — no greeting exists with the identifier.
 */
export const get = oc
  .route({
    method: 'GET',
    path: '/hello/get',
    operationId: 'getHello',
    summary: 'Get a greeting',
    description: 'Return one greeting by its identifier.',
    tags: ['hello'],
    successStatus: 200,
  })
  .meta({ auth: 'public' })
  .errors({
    BAD_REQUEST: { status: 400 },
    NOT_FOUND: { status: 404 },
  })
  .input(SHelloGetInput)
  .output(SHelloGetOutput)
