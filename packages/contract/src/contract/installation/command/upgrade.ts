import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SInstallation } from '../schema.ts'

export const SInstallationUpgradeInput = v.strictObject({ confirmation: v.literal('UPGRADE') })
export type SInstallationUpgradeInput = v.InferOutput<typeof SInstallationUpgradeInput>
export const SInstallationUpgradeOutput = SInstallation
export type SInstallationUpgradeOutput = v.InferOutput<typeof SInstallationUpgradeOutput>

export const upgradeInstallation = oc
  .route({
    method: 'POST',
    path: '/installation/upgradeInstallation',
    operationId: 'upgradeInstallation',
    summary: 'Upgrade installation',
    description:
      'Start an explicit installation migration after creating an authoritative SQLite safety backup.',
    tags: ['installation'],
    successStatus: 202,
  })
  .meta({ auth: 'admin', admission: 'exempt' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    CONFLICT: {},
    INCOMPATIBLE_BACKUP: {},
    INSUFFICIENT_STORAGE: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SInstallationUpgradeInput)
  .output(SInstallationUpgradeOutput)
