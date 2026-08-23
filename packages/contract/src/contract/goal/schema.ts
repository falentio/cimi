import * as v from 'valibot'
import { SCreated, SDateTime, SId, SName, SQueryFilter } from '../../schema/index.ts'

export const SGoalAction = v.strictObject({
  kind: v.picklist(['page_view', 'custom_event', 'outbound', 'performance', 'error']),
  name: v.optional(SName),
})
export const SGoal = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      id: SId,
      siteId: SId,
      name: SName,
      action: SGoalAction,
      propertyFilters: v.optional(v.pipe(v.array(SQueryFilter), v.maxLength(20))),
      status: v.picklist(['active', 'archived']),
    }),
    SCreated,
  ]),
)
export const SGoalReport = v.strictObject({
  from: SDateTime,
  to: SDateTime,
  conversions: v.number(),
  conversionRate: v.number(),
})
export const SGoalSiteFields = v.strictObject({ siteId: SId })
export const SGoalIdentityFields = v.strictObject({ siteId: SId, goalId: SId })
export const SGoalDefinitionFields = v.strictObject({
  name: SName,
  action: SGoalAction,
  propertyFilters: v.optional(v.pipe(v.array(SQueryFilter), v.maxLength(20))),
})
