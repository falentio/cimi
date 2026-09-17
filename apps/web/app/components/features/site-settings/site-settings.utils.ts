import type { Site, SiteId, SiteSettingsDraft } from './site-settings.types'

const SITE_NAME_MAX_LENGTH = 256
const HOSTNAME_MAX_LENGTH = 253

export const WEEK_START_OPTIONS: readonly {
  readonly value: SiteSettingsDraft['weekStartsOn']
  readonly label: string
}[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
]

export function parseSiteId(value: unknown): SiteId | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

export function normalizeSiteSettingsDraft(draft: SiteSettingsDraft): SiteSettingsDraft {
  return {
    name: draft.name.trim(),
    hostname: draft.hostname.trim(),
    reportingTimezone: draft.reportingTimezone,
    weekStartsOn: draft.weekStartsOn,
  }
}

export function getSiteSettingsFieldError(
  field: keyof SiteSettingsDraft,
  draft: SiteSettingsDraft,
  hasSubmitted: boolean,
): string | null {
  if (!hasSubmitted) return null

  const value = draft[field]
  if (field === 'name') {
    if (value.trim() === '') return 'Enter a site name.'
    if (value.trim().length > SITE_NAME_MAX_LENGTH)
      return 'Site names must be 256 characters or fewer.'
    return null
  }

  if (field === 'hostname') {
    if (value.trim() === '') return 'Enter a hostname.'
    if (value.trim().length > HOSTNAME_MAX_LENGTH) {
      return 'Hostnames must be 253 characters or fewer.'
    }
    return null
  }

  if (field === 'reportingTimezone') {
    return value.trim() === '' ? 'Choose a reporting timezone.' : null
  }

  return WEEK_START_OPTIONS.some((option) => option.value === value)
    ? null
    : 'Choose the first day of the reporting week.'
}

export function getTimezoneOptions(currentTimezone?: Site['reportingTimezone']): readonly {
  readonly value: Site['reportingTimezone']
  readonly label: string
}[] {
  const supportedTimezones =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const values = new Set([...(supportedTimezones ?? []), 'UTC'])
  if (currentTimezone !== undefined) values.add(currentTimezone)

  return [...values].sort().map((value) => ({ value, label: value }))
}
