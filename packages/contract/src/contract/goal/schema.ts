import * as v from 'valibot'
import {
  SCreated,
  SDate,
  SId,
  SIdentityKind,
  SName,
  SNonNegativeInteger,
  SPropertyFilter,
  SReportFreshness,
  SRate,
  isValidReportRange,
} from '../../schema/index.ts'

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
      propertyFilters: v.optional(v.pipe(v.array(SPropertyFilter), v.maxLength(20))),
      identityKind: SIdentityKind,
      status: v.picklist(['active', 'archived']),
    }),
    SCreated,
  ]),
)
const SGoalReportPeriod = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      fromDate: SDate,
      toDate: SDate,
      conversions: SNonNegativeInteger,
      eligibleSessions: SNonNegativeInteger,
      conversionRate: SRate,
    }),
    SReportFreshness,
  ]),
)
export const SGoalReport = v.pipe(
  v.strictObject(
    v.entriesFromObjects([
      SGoalReportPeriod,
      v.strictObject({ comparison: v.optional(v.nullable(SGoalReportPeriod)) }),
    ]),
  ),
  v.check(
    (input) =>
      isValidReportRange({
        fromDate: input.fromDate,
        toDate: input.toDate,
        comparison: input.comparison ?? undefined,
      }),
    'Report output periods must be ordered.',
  ),
)
export const SGoalSiteFields = v.strictObject({ siteId: SId })
export const SGoalIdentityFields = v.strictObject({ siteId: SId, goalId: SId })
export const SGoalDefinitionFields = v.strictObject({
  name: SName,
  action: SGoalAction,
  propertyFilters: v.optional(v.pipe(v.array(SPropertyFilter), v.maxLength(20))),
  identityKind: SIdentityKind,
})
