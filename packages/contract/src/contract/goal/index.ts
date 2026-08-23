import { archiveGoal } from './command/archive.ts'
import { createGoal } from './command/create.ts'
import { updateGoal } from './command/update.ts'
import { getGoal } from './query/get.ts'
import { getGoalReport } from './query/get-report.ts'
import { listGoals } from './query/list.ts'

export const goal = { listGoals, getGoal, getGoalReport, createGoal, updateGoal, archiveGoal }
