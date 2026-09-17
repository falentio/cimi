import type { CimiOrpc } from '~/plugins/orpc'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { SettingsError } from '../../../utils/settings-error'

export type Site = Awaited<ReturnType<CimiOrpc['site']['getSite']['call']>>
export type SiteId = Site['id']
export type SiteSettingsDraft = Pick<
  Site,
  'name' | 'hostname' | 'reportingTimezone' | 'weekStartsOn'
>

type SiteDeleteOutput = Awaited<ReturnType<CimiOrpc['site']['deleteSite']['call']>>

export type SiteDeletionAcceptance = Pick<SiteDeleteOutput, 'operationId'>

export type SiteLoadState =
  | { readonly status: 'idle'; readonly siteId: SiteId | undefined }
  | { readonly status: 'loading'; readonly siteId: SiteId }
  | { readonly status: 'refreshing'; readonly site: Site }
  | { readonly status: 'ready'; readonly site: Site }
  | { readonly status: 'stale-error'; readonly site: Site; readonly error: SettingsError }
  | { readonly status: 'error'; readonly siteId: SiteId; readonly error: SettingsError }

export type SiteSaveState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving'; readonly draft: SiteSettingsDraft }
  | { readonly status: 'saved'; readonly site: Site; readonly warning?: SettingsError }
  | {
      readonly status: 'error'
      readonly draft: SiteSettingsDraft
      readonly error: SettingsError
    }

export type SiteDeletionState =
  | { readonly status: 'idle' }
  | { readonly status: 'confirming' }
  | { readonly status: 'submitting' }
  | {
      readonly status: 'accepted'
      readonly operationId: SiteDeletionAcceptance['operationId']
      readonly warning?: SettingsError
    }
  | { readonly status: 'error'; readonly error: SettingsError }

export interface SiteSettingsSnapshot {
  readonly siteId: SiteId | undefined
  readonly load: SiteLoadState
  readonly save: SiteSaveState
  readonly deletion: SiteDeletionState
}

export interface SiteSettingsOptions {
  readonly siteId: MaybeRefOrGetter<SiteId | undefined>
}

export interface SiteSettingsController {
  readonly snapshot: Readonly<ComputedRef<SiteSettingsSnapshot>>
  retry(): Promise<void>
  save(draft: SiteSettingsDraft): Promise<Site>
  beginDelete(): void
  cancelDelete(): void
  confirmDelete(): Promise<SiteDeletionAcceptance>
}
