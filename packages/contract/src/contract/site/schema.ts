import * as v from 'valibot'
import { SCreated, SId, SName } from '../../schema/index.ts'

export const SSite = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      id: SId,
      organizationId: SId,
      name: SName,
      hostname: v.pipe(v.string(), v.minLength(1), v.maxLength(253)),
      ingestionIdentifier: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
    }),
    SCreated,
  ]),
)
export const SSiteOrganizationFields = v.strictObject({
  organizationId: SId,
  name: SName,
  hostname: v.string(),
})
export const SSiteUpdateFields = v.strictObject({ siteId: SId, name: SName, hostname: v.string() })
export const SSiteUpdateV2Fields = v.strictObject(
  v.entriesFromObjects([SSiteUpdateFields, v.strictObject({ displayTimezone: v.string() })]),
)
export const SSiteIdFields = v.strictObject({ siteId: SId })
