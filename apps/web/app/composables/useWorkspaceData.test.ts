import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadWorkspaceData, type WorkspaceClient } from './useWorkspaceData'

const emptyPage = { items: [], nextOffset: null, hasMore: false }

const calls: string[] = []

const ensureInstallation = vi.fn()

const ensurePersonalOrganization = vi.fn()

const listOrganizations = vi.fn()

const listSites = vi.fn()

const client: WorkspaceClient = {
  installation: { ensureInstallation: { call: ensureInstallation } },
  organization: {
    ensurePersonalOrganization: { call: ensurePersonalOrganization },
    listOrganizations: { call: listOrganizations },
  },
  site: { listSites: { call: listSites } },
}

function track(name: string, mock: ReturnType<typeof vi.fn>): void {
  mock.mockImplementation(() => {
    calls.push(name)

    return Promise.resolve(emptyPage)
  })
}

beforeEach(() => {
  calls.length = 0
  vi.clearAllMocks()
  track('ensureInstallation', ensureInstallation)
  track('ensurePersonalOrganization', ensurePersonalOrganization)
  track('listOrganizations', listOrganizations)
  track('listSites', listSites)
})

afterEach(() => vi.restoreAllMocks())

describe('loadWorkspaceData', () => {
  it('ensures the installation before the personal organization for an admin session', async () => {
    const signal = new AbortController().signal

    await loadWorkspaceData(client, true, signal)

    expect(ensureInstallation).toHaveBeenCalledWith({}, { signal })
    expect(calls).toEqual(['ensureInstallation', 'ensurePersonalOrganization', 'listOrganizations'])
  })

  it('never ensures the installation for a non-admin session', async () => {
    await loadWorkspaceData(client, false, new AbortController().signal)

    expect(ensureInstallation).not.toHaveBeenCalled()
    expect(ensurePersonalOrganization).toHaveBeenCalledTimes(1)
  })

  it('proceeds to the personal organization when ensuring the installation fails', async () => {
    ensureInstallation.mockRejectedValue({ code: 'CONFLICT', status: 409 })

    await loadWorkspaceData(client, true, new AbortController().signal)

    expect(ensurePersonalOrganization).toHaveBeenCalledTimes(1)
    expect(await listOrganizations.mock.results[0]?.value).toEqual(emptyPage)
  })
})
