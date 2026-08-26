import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SHelloBase } from '../schema.ts'

export const SHelloWorldInput = v.pick(SHelloBase, ['name'])
export type SHelloWorldInput = v.InferOutput<typeof SHelloWorldInput>
export const SHelloWorldOutput = v.pick(SHelloBase, ['message'])
export type SHelloWorldOutput = v.InferOutput<typeof SHelloWorldOutput>

/**
 * Computes a deterministic greeting without reading or writing storage.
 *
 * @errors
 * - `BAD_REQUEST` — the name is empty or exceeds 256 characters.
 */
export const world = oc
  .route({
    method: 'GET',
    path: '/hello/world',
    operationId: 'helloWorld',
    summary: 'Compute a greeting',
    description: 'Compute a deterministic greeting for a supplied name.',
    tags: ['hello'],
    successStatus: 200,
  })
  .meta({ auth: 'public' })
  .errors({ BAD_REQUEST: {} })
  .input(SHelloWorldInput)
  .output(SHelloWorldOutput)
