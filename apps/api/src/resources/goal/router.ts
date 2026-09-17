import { api, authenticatedApi } from '../../orpc.ts'
import type { GoalService } from './service.ts'

export function goalRouter(service: GoalService) {
  return api.goal.router({
    listGoals: authenticatedApi.goal.listGoals.handler(({ input, context }) =>
      service.list(input, context.user),
    ),
    getGoal: authenticatedApi.goal.getGoal.handler(({ input, context }) =>
      service.get(input, context.user),
    ),
    getGoalReport: authenticatedApi.goal.getGoalReport.handler(({ input, context }) =>
      service.getReport(input, context.user),
    ),
    createGoal: authenticatedApi.goal.createGoal.handler(({ input, context }) =>
      service.create(input, context.user),
    ),
    updateGoal: authenticatedApi.goal.updateGoal.handler(({ input, context }) =>
      service.update(input, context.user),
    ),
    archiveGoal: authenticatedApi.goal.archiveGoal.handler(({ input, context }) =>
      service.archive(input, context.user),
    ),
  })
}
