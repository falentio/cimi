import { health as healthProcedure } from './query/health.ts'

export const health = { health: healthProcedure }
