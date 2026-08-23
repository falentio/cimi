import * as v from 'valibot'
import { SDateTime } from '../../schema/index.ts'

export const SInstallationStatus = v.picklist(['uninitialized', 'ready', 'maintenance'])
export const SInstallation = v.strictObject({
  status: SInstallationStatus,
  defaultRetentionMonths: v.number(),
  dataDirectoryReady: v.boolean(),
  updatedAt: SDateTime,
})
export const SInstallationInitializeFields = v.strictObject({ defaultRetentionMonths: v.number() })
