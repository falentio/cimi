import { api, authenticatedApi } from '../../orpc.ts'
import type { CohortService } from './service.ts'

export function cohortRetentionRouter(service: CohortService) {
  return api.cohortRetention.router({
    listCohorts: authenticatedApi.cohortRetention.listCohorts.handler(({ input, context }) =>
      service.list(input, context.user),
    ),
    getCohort: authenticatedApi.cohortRetention.getCohort.handler(({ input, context }) =>
      service.get(input, context.user),
    ),
    getRetentionReport: authenticatedApi.cohortRetention.getRetentionReport.handler(
      ({ input, context }) => service.getReport(input, context.user),
    ),
    createCohort: authenticatedApi.cohortRetention.createCohort.handler(({ input, context }) =>
      service.create(input, context.user),
    ),
    updateCohort: authenticatedApi.cohortRetention.updateCohort.handler(({ input, context }) =>
      service.update(input, context.user),
    ),
    archiveCohort: authenticatedApi.cohortRetention.archiveCohort.handler(({ input, context }) =>
      service.archive(input, context.user),
    ),
  })
}
