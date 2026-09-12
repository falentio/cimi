import type { FactWorkPort } from './ports.ts'
import type { FactWorkEstimate } from './types.ts'

export const FACT_WORK_WEIGHTS = {
  baseFacts: 1,
  extraMetrics: 0.25,
  bucketWork: 0.1,
  dimensions: 0.5,
  filters: 0.25,
  distinctCounts: 1,
} as const

export function estimateFactWork(
  input: Parameters<FactWorkPort['estimate']>[0],
): FactWorkEstimate | undefined {
  const values = [
    input.factCardinality,
    input.extraMetricCount,
    input.bucketWork,
    input.dimensionCount,
    input.filterCount,
    input.distinctCountOperations,
    input.budget,
  ]
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return undefined

  const components = {
    baseFacts: input.factCardinality * FACT_WORK_WEIGHTS.baseFacts,
    extraMetrics: input.extraMetricCount * FACT_WORK_WEIGHTS.extraMetrics,
    bucketWork: input.bucketWork * FACT_WORK_WEIGHTS.bucketWork,
    dimensions: input.dimensionCount * FACT_WORK_WEIGHTS.dimensions,
    filters: input.filterCount * FACT_WORK_WEIGHTS.filters,
    distinctCounts: input.distinctCountOperations * FACT_WORK_WEIGHTS.distinctCounts,
  }
  const units = Object.values(components).reduce((total, value) => total + value, 0)
  if (!Number.isFinite(units)) return undefined
  return { units, budget: input.budget, components }
}

export const defaultFactWorkEstimator = estimateFactWork
