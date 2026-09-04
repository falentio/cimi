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

export const ADMISSION_VALUES = ['ingestion', 'analytics-read', 'exempt'] as const

export type AdmissionClass = (typeof ADMISSION_VALUES)[number]

export interface AuthMeta extends Meta {
  auth?: AuthMetaValue
  devOnly?: boolean
  admission?: AdmissionClass
}
