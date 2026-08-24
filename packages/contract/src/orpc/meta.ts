import type { Meta } from '@orpc/contract'

export const AUTH_META_VALUES = [
  'public',
  'authenticated',
  'admin',
  'owner',
  'site-admin',
  'organization-admin',
  'installation-admin',
] as const

export type AuthMetaValue = (typeof AUTH_META_VALUES)[number]
export type AuthScope = AuthMetaValue

export interface AuthMeta extends Meta {
  auth?: AuthMetaValue
}
