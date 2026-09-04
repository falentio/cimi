import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'

export interface InstallationRepository {
  find(): Promise<InstallationRepository.Record | undefined>
  insert(input: InstallationRepository.CreateInput): Promise<InstallationRepository.Record>
  activate(
    input: InstallationRepository.ActivateInput,
  ): Promise<InstallationRepository.Record | undefined>
  beginUpgrade(
    input: InstallationRepository.BeginUpgradeInput,
  ): Promise<InstallationRepository.Record>
  findSafetyArtifact(
    operationId: string,
  ): Promise<InstallationRepository.SafetyArtifactInput | undefined>
  recordSafetyArtifact(
    input: InstallationRepository.RecordSafetyArtifactInput,
  ): Promise<InstallationRepository.Record | undefined>
  updateUpgradeProgress(
    input: InstallationRepository.UpdateUpgradeProgressInput,
  ): Promise<InstallationRepository.Record | undefined>
  claimUpgrade(
    input: InstallationRepository.ClaimUpgradeInput,
  ): Promise<InstallationRepository.Record | undefined>
  completeUpgrade(
    input: InstallationRepository.UpgradeTerminalInput,
  ): Promise<InstallationRepository.Record | undefined>
  failUpgrade(
    input: InstallationRepository.UpgradeTerminalInput,
  ): Promise<InstallationRepository.Record | undefined>
}

export declare namespace InstallationRepository {
  export type Status = InferOutput<typeof schema.SInstallationStatus>
  export type Installation = InferOutput<typeof schema.SInstallation>
  export type ActiveOperation = NonNullable<Installation['activeOperation']>
  export type CleanupStage = Installation['derivedCleanup']
  export type Retention = Installation['defaultRetention']

  export interface Record extends Installation {
    id: string
  }

  export interface CreateInput {
    id: string
    retentionPolicyId: string
    eventMonths: number
    profileMonths: number
    replayMonths: number | null
    dataDirectoryReady: boolean
    createdAt: Date
    updatedAt: Date
  }

  export interface ActivateInput {
    retentionPolicyId: string
    retention: Retention
    dataDirectoryReady: boolean
    updatedAt: Date
  }

  export interface SafetyArtifactInput {
    id: string
    generationId: string
    storageKey: string
    schemaVersion: string
    sizeBytes: number
    checksumAlgorithm: 'sha256'
    checksumValue: string
  }

  export interface BeginUpgradeInput {
    operationId: string
    ownerToken: string
    activeOperation: {
      phase: ActiveOperation['phase']
      checkpoint: ActiveOperation['checkpoint']
      progress: number | null
      lastSafeSequence: number | null
      errorCode: ActiveOperation['errorCode']
    }
    now: Date
  }

  export interface RecordSafetyArtifactInput {
    operationId: string
    ownerToken: string
    artifact: SafetyArtifactInput
    now: Date
  }

  export interface UpdateUpgradeProgressInput {
    operationId: string
    ownerToken: string
    checkpoint: ActiveOperation['checkpoint']
    progress: number
    backupPhase: 'capturing_sqlite' | 'rebuilding_duckdb'
    now: Date
  }

  export interface ClaimUpgradeInput {
    operationId: string
    expectedUpdatedAt: Date
    ownerToken: string
    now: Date
  }

  export interface UpgradeTerminalInput {
    operationId: string
    ownerToken: string
    errorCode?: ActiveOperation['errorCode']
    now: Date
  }
}
