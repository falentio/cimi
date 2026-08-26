import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOffsetPage, SOffsetPaginationInput, SPageItems } from '../../../schema/index.ts'
import { SHelloBase } from '../schema.ts'

export const SHelloListInput = v.strictObject({
  ...SOffsetPaginationInput.entries,
  name: v.optional(SHelloBase.entries.name),
})
export type SHelloListInput = v.InferOutput<typeof SHelloListInput>

export const SHelloListOutput = v.strictObject({
  items: SPageItems(SHelloBase),
  ...SOffsetPage.entries,
})
export type SHelloListOutput = v.InferOutput<typeof SHelloListOutput>

/**
 * Lists greeting records with bounded offset pagination and an optional name filter.
 *
 * @errors
 * - `BAD_REQUEST` — pagination or filter input is invalid.
 */
export const list = oc
  .route({
    method: 'GET',
    path: '/hello/list',
    operationId: 'listHello',
    summary: 'List greetings',
    description: 'List greeting records using bounded offset pagination.',
    tags: ['hello'],
    successStatus: 200,
  })
  .meta({ auth: 'public' })
  .errors({ BAD_REQUEST: {} })
  .input(SHelloListInput)
  .output(SHelloListOutput)
