import * as v from 'valibot'
import {
  SCreated,
  SDateTime,
  SHostname,
  SIanaTimezone,
  SId,
  SName,
  SWeekStart,
} from '../../schema/index.ts'

export { SHostname }
export const SSite = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      id: SId,
      organizationId: SId,
      name: SName,
      hostname: SHostname,
      ingestionIdentifier: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
      reportingTimezone: SIanaTimezone,
      weekStartsOn: SWeekStart,
    }),
    SCreated,
  ]),
)
export const SSiteOrganizationFields = v.strictObject({
  organizationId: SId,
  name: SName,
  hostname: SHostname,
})
export const SSiteOrganizationScopeFields = v.strictObject({ organizationId: SId })
export const SSiteUpdateFields = v.strictObject({ siteId: SId, name: SName, hostname: SHostname })
export const SSiteUpdateV2Fields = v.strictObject(
  v.entriesFromObjects([
    SSiteUpdateFields,
    v.strictObject({
      reportingTimezone: SIanaTimezone,
      weekStartsOn: SWeekStart,
    }),
  ]),
)
export const SSiteIdFields = v.strictObject({ siteId: SId })
export const SSiteLifecycleStatus = v.picklist([
  'active',
  'deleting',
  'deleted',
  'recovering',
  'purged',
])
export const SSiteDeletionErrorCode = v.picklist(['CLEANUP_FAILED', 'INTERNAL_SERVER_ERROR'])
export const SSiteDeletionCleanupStatus = v.strictObject({
  status: v.picklist(['not-required', 'pending', 'complete', 'failed']),
  updatedAt: SDateTime,
  errorCode: v.nullable(SSiteDeletionErrorCode),
})
