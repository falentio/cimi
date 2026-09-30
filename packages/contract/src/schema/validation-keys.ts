import { VALIDATION_KEYS as SHARED_VALIDATION_KEYS } from '@cimi/utils'

type ContractValidationKey = `validation.contract.${string}`
type ContractValidationKeyTree = {
  readonly [key: string]: ContractValidationKey | ContractValidationKeyTree
}

const contractValidationKeys = {
  batch: {
    collectionContextScoped: 'validation.contract.batch.collectionContextScoped',
    ingestionIdentifierMatches: 'validation.contract.batch.ingestionIdentifierMatches',
  },
  backup: {
    safetyArtifactCoherent: 'validation.contract.backup.safetyArtifactCoherent',
    stateCoherent: 'validation.contract.backup.stateCoherent',
  },
  cohort: {
    actionsDistinct: 'validation.contract.cohort.actionsDistinct',
  },
  date: {
    invalid: 'validation.contract.date.invalid',
  },
  dateTime: {
    invalid: 'validation.contract.dateTime.invalid',
    utc: 'validation.contract.dateTime.utc',
  },
  event: {
    filtersCompatibleWithKind: 'validation.contract.event.filtersCompatibleWithKind',
    propertiesReservedName: 'validation.contract.event.propertiesReservedName',
    propertyFilterValuesCompatible: 'validation.contract.event.propertyFilterValuesCompatible',
    reportFilterValuesCompatible: 'validation.contract.event.reportFilterValuesCompatible',
  },
  funnel: {
    reportStepsContiguous: 'validation.contract.funnel.reportStepsContiguous',
    stepsDistinct: 'validation.contract.funnel.stepsDistinct',
  },
  health: {
    stateCoherent: 'validation.contract.health.stateCoherent',
  },
  installation: {
    stateCoherent: 'validation.contract.installation.stateCoherent',
  },
  lifecycle: {
    cleanupStageCoherent: 'validation.contract.lifecycle.cleanupStageCoherent',
  },
  profile: {
    epochNumbersUnique: 'validation.contract.profile.epochNumbersUnique',
    traitKeysAllowed: 'validation.contract.profile.traitKeysAllowed',
    traitsMaxCount: 'validation.contract.profile.traitsMaxCount',
    traitsSize: 'validation.contract.profile.traitsSize',
  },
  properties: {
    maxCount: 'validation.contract.properties.maxCount',
  },
  publicDashboard: {
    dateRange: 'validation.contract.publicDashboard.dateRange',
    dimensionFiltersString: 'validation.contract.publicDashboard.dimensionFiltersString',
    timeBucketOffset: 'validation.contract.publicDashboard.timeBucketOffset',
    utcTimestamp: 'validation.contract.publicDashboard.utcTimestamp',
  },
  report: {
    dateRangeOrdered: 'validation.contract.report.dateRangeOrdered',
    filtersCompatible: 'validation.contract.report.filtersCompatible',
    granularRangeInvalid: 'validation.contract.report.granularRangeInvalid',
    outputPeriodsOrdered: 'validation.contract.report.outputPeriodsOrdered',
  },
  retention: {
    policyOrder: 'validation.contract.retention.policyOrder',
  },
  site: {
    lifecycleTimestampsMatchStatus: 'validation.contract.site.lifecycleTimestampsMatchStatus',
  },
} as const satisfies ContractValidationKeyTree

export const VALIDATION_KEYS = {
  shared: SHARED_VALIDATION_KEYS.shared,
  contract: contractValidationKeys,
} as const
