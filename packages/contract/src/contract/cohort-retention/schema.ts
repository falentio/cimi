import * as v from 'valibot'
import {
  SCreated,
  SDate,
  SId,
  SIdentityKind,
  SName,
  SNonNegativeInteger,
  SReportFreshness,
  SRate,
  isValidReportRange,
} from '../../schema/index.ts'

export const SCohortAction = v.variant('kind', [
  v.strictObject({ kind: v.literal('page_view') }),
  v.strictObject({ kind: v.literal('custom_event'), name: SName }),
  v.strictObject({ kind: v.literal('outbound'), name: v.optional(SName) }),
  v.strictObject({ kind: v.literal('performance'), name: SName }),
  v.strictObject({ kind: v.literal('error'), name: SName }),
])
type SCohortActionOutput = v.InferOutput<typeof SCohortAction>
export const areDistinctCohortActions = (input: {
  entryAction: SCohortActionOutput
  retentionAction: SCohortActionOutput
}) => JSON.stringify(input.entryAction) !== JSON.stringify(input.retentionAction)
const SCohortRecord = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      id: SId,
      siteId: SId,
      name: SName,
      entryAction: SCohortAction,
      retentionAction: SCohortAction,
      identityKind: SIdentityKind,
      period: v.picklist(['day', 'week', 'month']),
      status: v.picklist(['active', 'archived']),
    }),
    SCreated,
  ]),
)
export const SCohort = v.pipe(
  SCohortRecord,
  v.check(
    (input: v.InferOutput<typeof SCohortRecord>) => areDistinctCohortActions(input),
    'Entry and retention actions must be distinct.',
  ),
)
const SCohortReportPeriod = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      fromDate: SDate,
      toDate: SDate,
      periods: v.pipe(
        v.array(
          v.strictObject({
            index: SNonNegativeInteger,
            fromDate: SDate,
            toDate: SDate,
            size: SNonNegativeInteger,
            retained: SNonNegativeInteger,
            rate: SRate,
          }),
        ),
        v.maxLength(12),
      ),
    }),
    SReportFreshness,
  ]),
)
export const SCohortReport = v.pipe(
  v.strictObject(
    v.entriesFromObjects([
      SCohortReportPeriod,
      v.strictObject({ comparison: v.optional(v.nullable(SCohortReportPeriod)) }),
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
export const SCohortSiteFields = v.strictObject({ siteId: SId })
export const SCohortIdentityFields = v.strictObject({ siteId: SId, cohortId: SId })
const SCohortDefinitionRecord = v.strictObject({
  name: SName,
  entryAction: SCohortAction,
  retentionAction: SCohortAction,
  identityKind: SIdentityKind,
  period: v.picklist(['day', 'week', 'month']),
})
export const SCohortDefinitionFields = SCohortDefinitionRecord
