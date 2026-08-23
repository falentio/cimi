import * as v from 'valibot'
import {
  SCreated,
  SDate,
  SId,
  SIdentityKind,
  SName,
  SNonNegativeInteger,
  SRate,
  SPropertyFilter,
  SReportFreshness,
  isValidReportRange,
} from '../../schema/index.ts'

export const SFunnelAction = v.strictObject({
  kind: v.picklist(['page_view', 'custom_event', 'outbound', 'performance', 'error']),
  name: v.optional(SName),
  propertyFilters: v.optional(v.pipe(v.array(SPropertyFilter), v.maxLength(20))),
})
export const SFunnelSteps = v.pipe(
  v.array(SFunnelAction),
  v.minLength(2),
  v.maxLength(10),
  v.check(
    (steps) => new Set(steps.map((step) => JSON.stringify(step))).size === steps.length,
    'Funnel steps must be distinct.',
  ),
)
export const SFunnel = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      id: SId,
      siteId: SId,
      name: SName,
      steps: SFunnelSteps,
      identityKind: SIdentityKind,
      status: v.picklist(['active', 'archived']),
    }),
    SCreated,
  ]),
)
const SFunnelReportPeriod = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      fromDate: SDate,
      toDate: SDate,
      steps: v.pipe(
        v.array(
          v.strictObject({
            index: SNonNegativeInteger,
            matched: SNonNegativeInteger,
            rateFromEntry: SRate,
            rateFromPrevious: SRate,
          }),
        ),
        v.maxLength(10),
      ),
    }),
    SReportFreshness,
  ]),
)
export const SFunnelReport = v.pipe(
  v.strictObject(
    v.entriesFromObjects([
      SFunnelReportPeriod,
      v.strictObject({ comparison: v.optional(v.nullable(SFunnelReportPeriod)) }),
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
export const SFunnelSiteFields = v.strictObject({ siteId: SId })
export const SFunnelIdentityFields = v.strictObject({ siteId: SId, funnelId: SId })
export const SFunnelDefinitionFields = v.strictObject({
  name: SName,
  steps: SFunnelSteps,
  identityKind: SIdentityKind,
})
