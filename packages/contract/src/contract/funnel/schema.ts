import * as v from 'valibot'
import { SCreated, SDateTime, SId, SName, SQueryFilter } from '../../schema/index.ts'

export const SFunnelAction = v.strictObject({
  kind: v.picklist(['page_view', 'custom_event', 'outbound', 'performance', 'error']),
  name: v.optional(SName),
  propertyFilters: v.optional(v.pipe(v.array(SQueryFilter), v.maxLength(20))),
})
export const SFunnelSteps = v.pipe(v.array(SFunnelAction), v.minLength(2), v.maxLength(10))
export const SFunnel = v.strictObject(
  v.entriesFromObjects([
    v.strictObject({
      id: SId,
      siteId: SId,
      name: SName,
      steps: SFunnelSteps,
      status: v.picklist(['active', 'archived']),
    }),
    SCreated,
  ]),
)
export const SFunnelReport = v.strictObject({
  from: SDateTime,
  to: SDateTime,
  steps: v.array(
    v.strictObject({ index: v.number(), matched: v.number(), conversionRate: v.number() }),
  ),
})
export const SFunnelSiteFields = v.strictObject({ siteId: SId })
export const SFunnelIdentityFields = v.strictObject({ siteId: SId, funnelId: SId })
export const SFunnelDefinitionFields = v.strictObject({ name: SName, steps: SFunnelSteps })
