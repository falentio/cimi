import type { RetentionResolver } from '@cimi/kernel'
import type { RetentionPolicyRepository } from './repository.ts'

export interface CreateRetentionResolverDependencies {
  readonly repository: RetentionPolicyRepository
}

export function createRetentionResolver({
  repository,
}: CreateRetentionResolverDependencies): RetentionResolver {
  return {
    async effective(siteId: string) {
      const resolved = await repository.findResolved({ siteId })

      return {
        eventMonths: resolved.effectivePolicy.eventMonths,
        profileMonths: resolved.effectivePolicy.profileMonths,
        replayMonths: resolved.effectivePolicy.replayMonths,
      }
    },
  }
}
