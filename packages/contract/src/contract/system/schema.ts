import * as v from 'valibot'

export const SSystemHealthOutput = v.object({
  status: v.literal('ok'),
  controlDatabase: v.boolean(),
  analyticsDatabase: v.boolean(),
})
