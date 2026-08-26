import * as v from 'valibot'

export const SId = v.pipe(v.string(), v.minLength(1), v.maxLength(128))
export const SName = v.pipe(v.string(), v.minLength(1), v.maxLength(256))

export const canonicalizeHostname = (hostname: string) => hostname.toLowerCase().replace(/\.$/, '')

export const SHostname = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(253),
  v.regex(
    /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.?$/,
  ),
  v.transform(canonicalizeHostname),
)

export const SIanaTimezone = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(64),
  v.check((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
      return true
    } catch {
      return false
    }
  }, 'Expected a valid IANA timezone.'),
)

export const SWeekStart = v.picklist([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
])

export type Id = v.InferOutput<typeof SId>
export type Name = v.InferOutput<typeof SName>
export type Hostname = v.InferOutput<typeof SHostname>
export type IanaTimezone = v.InferOutput<typeof SIanaTimezone>
export type WeekStart = v.InferOutput<typeof SWeekStart>
