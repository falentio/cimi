import { api, authenticatedApi } from '../../orpc.ts'
import type { CollectionPolicyService } from './service.ts'

const collectionPolicyApi = api.collectionPolicy
const authenticatedCollectionPolicyApi = authenticatedApi.collectionPolicy

export function collectionPolicyRouter(service: CollectionPolicyService) {
  return collectionPolicyApi.router({
    getCollectionPolicy: authenticatedCollectionPolicyApi.getCollectionPolicy.handler(
      ({ input, context }) => service.get(input, context.user),
    ),
    updateCollectionPolicy: authenticatedCollectionPolicyApi.updateCollectionPolicy.handler(
      ({ input, context }) => service.update(input, context.user),
    ),
  })
}
