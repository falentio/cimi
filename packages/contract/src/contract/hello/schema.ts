import * as v from 'valibot'
import { SDateTime, SId, SName } from '../../schema/index.ts'

export const SHelloMessage = v.pipe(v.string(), v.minLength(1), v.maxLength(256))

export const SHelloBase = v.strictObject({
  id: SId,
  ownerId: SId,
  name: SName,
  message: SHelloMessage,
  createdAt: SDateTime,
})
