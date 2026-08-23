import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { initializeInstallation, SInstallationInitializeOutput } from './command/initialize.ts'

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

  it('rejects the legacy compact response shape', () => {
    expect(() => v.parse(SInstallationInitializeOutput, installation)).toThrow(v.ValiError)
  })
})
