import * as v from 'valibot'

export const SCollectionContext = v.strictObject({
  consent: v.optional(v.picklist(['granted', 'denied'])),
  gpc: v.optional(v.boolean()),
  dnt: v.optional(v.boolean()),
})
