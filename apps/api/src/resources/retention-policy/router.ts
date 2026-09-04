import { api, authenticatedApi } from '../../orpc.ts'
import type { RetentionPolicyService } from './service.ts'

const retentionPolicyApi = api.retentionPolicy
const authenticatedRetentionPolicyApi = authenticatedApi.retentionPolicy

export function retentionPolicyRouter(service: RetentionPolicyService) {
  return retentionPolicyApi.router({
    getRetentionPolicy: authenticatedRetentionPolicyApi.getRetentionPolicy.handler(
      ({ input, context }) => service.get(input, context.user),
    ),
    updateRetentionPolicy: authenticatedRetentionPolicyApi.updateRetentionPolicy.handler(
      ({ input, context }) => service.update(input, context.user),
    ),
  })
}
