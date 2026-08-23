import { updateRetentionPolicy } from './command/update.ts'
import { getRetentionPolicy } from './query/get.ts'

export const retentionPolicy = { getRetentionPolicy, updateRetentionPolicy }
