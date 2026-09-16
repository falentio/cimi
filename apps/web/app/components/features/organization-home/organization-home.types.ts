import type { ComputedRef } from 'vue'
import type { WorkspaceSite, WorkspaceTeam } from '@/components/features/app-shell/workspace'
import type {
  OrganizationId,
  SettingsError,
} from '@/components/features/organization-settings/organization-settings.types'

export type OrganizationHomeState =
  | {
      readonly kind: 'invalid-route'
    }
  | {
      readonly kind: 'loading'
    }
  | {
      readonly kind: 'error'
      readonly error: SettingsError
    }
  | {
      readonly kind: 'missing'
      readonly organizationId: OrganizationId
    }
  | {
      readonly kind: 'ready'
      readonly organization: WorkspaceTeam
      readonly sites: readonly WorkspaceSite[]
    }

export interface OrganizationHomeController {
  readonly state: Readonly<ComputedRef<OrganizationHomeState>>
  refresh(): Promise<void>
}
