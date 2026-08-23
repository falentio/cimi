import * as v from 'valibot'
import { SCreated, SDateTime, SId, SName } from '../../schema/index.ts'

export const SCohortAction = v.strictObject({
  kind: v.picklist(['page_view', 'custom_event', 'outbound', 'performance', 'error']),
  name: v.optional(SName),
})
export const SCohort = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      id: SId,
      siteId: SId,
      name: SName,
      entryAction: SCohortAction,
      retentionAction: SCohortAction,
      period: v.picklist(['day', 'week', 'month']),
      status: v.picklist(['active', 'archived']),
    }),
    SCreated,
  ]),
)
export const SCohortReport = v.strictObject({
  from: SDateTime,
  to: SDateTime,
  periods: v.pipe(
    v.array(
      v.strictObject({
        index: v.number(),
        size: v.number(),
        retained: v.number(),
        rate: v.number(),
      }),
    ),
    v.maxLength(12),
  ),
})
export const SCohortSiteFields = v.strictObject({ siteId: SId })
export const SCohortIdentityFields = v.strictObject({ siteId: SId, cohortId: SId })
export const SCohortDefinitionFields = v.strictObject({
  name: SName,
  entryAction: SCohortAction,
  retentionAction: SCohortAction,
  period: v.picklist(['day', 'week', 'month']),
})
