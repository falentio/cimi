import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'

export interface InstallationRepository {
  find(): Promise<InstallationRepository.Record | undefined>
  insert(input: InstallationRepository.CreateInput): Promise<InstallationRepository.Record>
  update(
    input: InstallationRepository.UpdateInput,
  ): Promise<InstallationRepository.Record | undefined>
  beginUpgrade(
    input: InstallationRepository.BeginUpgradeInput,
  ): Promise<InstallationRepository.Record>
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
    eventMonths: number
    profileMonths: number
    replayMonths: number | null
    dataDirectoryReady: boolean
    createdAt: Date
    updatedAt: Date
  }

  export interface UpdateInput {
    status: Status
    activeOperation: Installation['activeOperation']
    retention?: Retention | undefined
    dataDirectoryReady?: boolean | undefined
    updatedAt: Date
  }

  export interface SafetyArtifactInput {
    id: string
    generationId: string
    storageKey: string
    schemaVersion: string
    sizeBytes: number
    checksumAlgorithm: string
    checksumValue: string
  }

  export interface BeginUpgradeInput {
    operationId: string
    activeOperation: {
      phase: string
      progress: number | null
      lastSafeSequence: number | null
      errorCode: ActiveOperation['errorCode']
    }
    artifact: SafetyArtifactInput
    now: Date
  }
}
