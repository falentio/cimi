import { oc as baseOc } from '@orpc/contract'
import type { AuthMeta } from './meta.ts'

export const oc = baseOc.$meta<AuthMeta>({ devOnly: false })
