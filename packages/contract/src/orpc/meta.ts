import type { Meta } from '@orpc/contract'

export interface AuthMeta extends Meta {
  auth?: 'public' | 'authenticated' | 'admin'
}
