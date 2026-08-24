import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  initializeInstallation,
  SInstallationInitializeInput,
  SInstallationInitializeOutput,
} from './command/initialize.ts'
import { DEFAULT_RETENTION_POLICY } from './schema.ts'
import { SInstallationUpgradeInput, upgradeInstallation } from './command/upgrade.ts'

const installation = {
  status: 'ready',
  defaultRetention: {
    eventMonths: 12,
    profileMonths: 12,
    replayMonths: null,
  },
  dataDirectoryReady: true,
  activeOperation: null,
  cleanupPending: false,
  derivedCleanup: {
    status: 'not_applicable',
    startedAt: null,
    completedAt: null,
    errorCode: null,
  },
  backupCleanup: {
    status: 'not_applicable',
    startedAt: null,
    completedAt: null,
    errorCode: null,
  },
  updatedAt: '2026-08-23T00:00:00Z',
} as const

describe('installation initialization contract', () => {
  it('declares detailed output with 200 as the fallback status', () => {
    expect(initializeInstallation['~orpc'].route).toMatchObject({
      outputStructure: 'detailed',
      successStatus: 200,
    })
  })

  it.each([200, 201])('accepts a detailed success response with status %s', (status) => {
    expect(
      v.parse(SInstallationInitializeOutput, {
        status,
        body: installation,
      }),
    ).toEqual({ status, body: installation })
  })

  it('allows initialization to resolve the default retention policy', () => {
    expect(v.parse(SInstallationInitializeInput, {})).toEqual({
      defaultRetention: DEFAULT_RETENTION_POLICY,
    })
  })

  it('exposes an explicit upgrade command with a 202 response', () => {
    expect(upgradeInstallation['~orpc'].route).toMatchObject({
      operationId: 'upgradeInstallation',
      successStatus: 202,
    })
    expect(v.parse(SInstallationUpgradeInput, { confirmation: 'UPGRADE' })).toEqual({
      confirmation: 'UPGRADE',
    })
  })

  it('requires a mounted data directory for ready installations', () => {
    expect(() =>
      v.parse(SInstallationInitializeOutput, {
        status: 200,
        body: { ...installation, dataDirectoryReady: false },
      }),
    ).toThrow(v.ValiError)
  })

  it('rejects the legacy compact response shape', () => {
    expect(() => v.parse(SInstallationInitializeOutput, installation)).toThrow(v.ValiError)
  })
})
