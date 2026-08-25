import { isContractProcedure } from '@orpc/contract'
import { describe, expect, it } from 'vitest'
import { contract } from '../contract.ts'

const statuses = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  OWNER_PROTECTED: 409,
  ORGANIZATION_NOT_EMPTY: 409,
  PERSONAL_ORGANIZATION_PROTECTED: 409,
  INVITATION_CONSUMED: 409,
  QUERY_LIMIT_EXCEEDED: 422,
  INCOMPATIBLE_BACKUP: 422,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  SERVICE_UNAVAILABLE: 503,
  INSUFFICIENT_STORAGE: 507,
  INTERNAL_SERVER_ERROR: 500,
} as const

type ErrorCode = keyof typeof statuses
type ErrorMap = Record<string, { status?: number }>

const catalog = (...codes: ErrorCode[]): ErrorMap =>
  Object.fromEntries(codes.map((code) => [code, { status: statuses[code] }]))

const authenticatedRead = catalog('UNAUTHORIZED', 'NOT_FOUND')
const administratorRead = catalog('UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND')
const definitionList = catalog('UNAUTHORIZED', 'NOT_FOUND', 'BAD_REQUEST')
const definitionCreateOrUpdate = catalog(
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'BAD_REQUEST',
  'CONFLICT',
)
const definitionArchive = catalog('UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT')
const analyticsReport = catalog(
  'UNAUTHORIZED',
  'NOT_FOUND',
  'BAD_REQUEST',
  'QUERY_LIMIT_EXCEEDED',
  'SERVICE_UNAVAILABLE',
)
const siteCommand = catalog('UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST', 'CONFLICT')
const siteLifecycleCommand = catalog('UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT')
const siteRead = catalog('UNAUTHORIZED', 'NOT_FOUND', 'BAD_REQUEST')
const siteDeletionStatus = catalog('UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST')

const expectedErrors: Record<string, ErrorMap> = {
  'backupRestore.listBackups': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'INTERNAL_SERVER_ERROR',
  ),
  'backupRestore.getBackupStatus': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'INTERNAL_SERVER_ERROR',
  ),
  'backupRestore.createBackup': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'CONFLICT',
    'INSUFFICIENT_STORAGE',
    'INTERNAL_SERVER_ERROR',
  ),
  'backupRestore.restoreBackup': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'CONFLICT',
    'INCOMPATIBLE_BACKUP',
    'INSUFFICIENT_STORAGE',
    'INTERNAL_SERVER_ERROR',
  ),
  'cohortRetention.listCohorts': definitionList,
  'cohortRetention.getCohort': authenticatedRead,
  'cohortRetention.getRetentionReport': analyticsReport,
  'cohortRetention.createCohort': definitionCreateOrUpdate,
  'cohortRetention.updateCohort': definitionCreateOrUpdate,
  'cohortRetention.archiveCohort': definitionArchive,
  'collectionPolicy.getCollectionPolicy': administratorRead,
  'collectionPolicy.updateCollectionPolicy': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'CONFLICT',
  ),
  'eventIngestion.collectEvent': catalog(
    'BAD_REQUEST',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'PAYLOAD_TOO_LARGE',
    'TOO_MANY_REQUESTS',
    'SERVICE_UNAVAILABLE',
  ),
  'eventIngestion.collectEvents': catalog(
    'BAD_REQUEST',
    'NOT_FOUND',
    'PAYLOAD_TOO_LARGE',
    'TOO_MANY_REQUESTS',
    'SERVICE_UNAVAILABLE',
  ),
  'eventReport.getEventOverview': analyticsReport,
  'eventReport.getEventBreakdowns': analyticsReport,
  'eventReport.getEventTimeseries': analyticsReport,
  'eventReport.listEvents': analyticsReport,
  'funnel.listFunnels': definitionList,
  'funnel.getFunnel': authenticatedRead,
  'funnel.getFunnelReport': analyticsReport,
  'funnel.createFunnel': definitionCreateOrUpdate,
  'funnel.updateFunnel': definitionCreateOrUpdate,
  'funnel.archiveFunnel': definitionArchive,
  'goal.listGoals': definitionList,
  'goal.getGoal': authenticatedRead,
  'goal.getGoalReport': analyticsReport,
  'goal.createGoal': definitionCreateOrUpdate,
  'goal.updateGoal': definitionCreateOrUpdate,
  'goal.archiveGoal': definitionArchive,
  'health.health': catalog('INTERNAL_SERVER_ERROR'),
  'hello.list': catalog('BAD_REQUEST'),
  'hello.get': catalog('BAD_REQUEST', 'NOT_FOUND'),
  'hello.world': catalog('BAD_REQUEST'),
  'hello.create': catalog('BAD_REQUEST', 'UNAUTHORIZED'),
  'hello.remove': catalog('BAD_REQUEST', 'UNAUTHORIZED', 'NOT_FOUND'),
  'identityProfile.listProfiles': catalog('UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST'),
  'identityProfile.getProfile': administratorRead,
  'identityProfile.getDeletionStatus': administratorRead,
  'identityProfile.identify': catalog(
    'BAD_REQUEST',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'PAYLOAD_TOO_LARGE',
    'TOO_MANY_REQUESTS',
  ),
  'identityProfile.requestProfileDeletion': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
  ),
  'installation.getInstallationStatus': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'INTERNAL_SERVER_ERROR',
  ),
  'installation.initializeInstallation': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'CONFLICT',
    'INTERNAL_SERVER_ERROR',
  ),
  'installation.upgradeInstallation': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'CONFLICT',
    'INCOMPATIBLE_BACKUP',
    'INSUFFICIENT_STORAGE',
    'INTERNAL_SERVER_ERROR',
  ),
  'invitation.listInvitations': catalog('UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST'),
  'invitation.createInvitation': catalog('UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_REQUEST'),
  'invitation.revokeInvitation': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'INVITATION_CONSUMED',
  ),
  'invitation.acceptInvitation': catalog('UNAUTHORIZED', 'NOT_FOUND', 'CONFLICT'),
  'membership.listMembers': catalog(
    'UNAUTHORIZED',
    'NOT_FOUND',
    'BAD_REQUEST',
    'INTERNAL_SERVER_ERROR',
  ),
  'membership.changeMemberRole': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'OWNER_PROTECTED',
  ),
  'membership.removeMember': catalog('UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'OWNER_PROTECTED'),
  'membership.leaveOrganization': catalog('UNAUTHORIZED', 'NOT_FOUND', 'OWNER_PROTECTED'),
  'membership.transferOrganizationOwnership': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
  ),
  'organization.listOrganizations': catalog('UNAUTHORIZED', 'BAD_REQUEST', 'INTERNAL_SERVER_ERROR'),
  'organization.getOrganization': siteRead,
  'organization.ensurePersonalOrganization': catalog(
    'UNAUTHORIZED',
    'CONFLICT',
    'INTERNAL_SERVER_ERROR',
  ),
  'organization.createOrganization': catalog(
    'UNAUTHORIZED',
    'BAD_REQUEST',
    'CONFLICT',
    'INTERNAL_SERVER_ERROR',
  ),
  'organization.updateOrganization': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
  ),
  'organization.deleteOrganization': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'ORGANIZATION_NOT_EMPTY',
    'PERSONAL_ORGANIZATION_PROTECTED',
  ),
  'publicDashboard.getPublicDashboardConfig': administratorRead,
  'publicDashboard.queryPublicDashboard': catalog(
    'BAD_REQUEST',
    'NOT_FOUND',
    'SERVICE_UNAVAILABLE',
    'TOO_MANY_REQUESTS',
    'QUERY_LIMIT_EXCEEDED',
  ),
  'publicDashboard.enablePublicDashboard': siteLifecycleCommand,
  'publicDashboard.disablePublicDashboard': administratorRead,
  'publicDashboard.rotatePublicDashboardIdentifier': siteLifecycleCommand,
  'retentionPolicy.getRetentionPolicy': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'INTERNAL_SERVER_ERROR',
  ),
  'retentionPolicy.updateRetentionPolicy': catalog(
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'BAD_REQUEST',
    'CONFLICT',
    'INTERNAL_SERVER_ERROR',
  ),
  'site.listSites': catalog('UNAUTHORIZED', 'BAD_REQUEST', 'INTERNAL_SERVER_ERROR'),
  'site.getSite': siteRead,
  'site.getSiteDeletionStatus': siteDeletionStatus,
  'site.createSite': siteCommand,
  'site.updateSiteV2': siteCommand,
  'site.deleteSite': siteLifecycleCommand,
  'site.recoverSite': siteLifecycleCommand,
  'site.rotateIngestionIdentifier': siteLifecycleCommand,
  'trafficReport.getTrafficOverview': analyticsReport,
  'trafficReport.getTrafficBreakdowns': analyticsReport,
}

const getErrorMap = (path: string): ErrorMap => {
  const procedure = path
    .split('.')
    .reduce<unknown>((node, segment) => (node as Record<string, unknown>)[segment], contract) as {
    '~orpc': { errorMap: ErrorMap }
  }
  return procedure['~orpc'].errorMap
}

const getMissingSuccessStatuses = (node: unknown, path: string[] = []): string[] => {
  if (isContractProcedure(node)) {
    return node['~orpc'].route.successStatus === undefined ? [path.join('.')] : []
  }

  if (node === null || typeof node !== 'object') return []

  return Object.entries(node).flatMap(([key, value]) =>
    getMissingSuccessStatuses(value, [...path, key]),
  )
}

const resourcePaths = {
  backupRestore: 'backup-restore',
  cohortRetention: 'cohort-retention',
  collectionPolicy: 'collection-policy',
  eventIngestion: 'event-ingestion',
  eventReport: 'event-report',
  funnel: 'funnel',
  goal: 'goal',
  health: 'system',
  hello: 'hello',
  identityProfile: 'identity-profile',
  installation: 'installation',
  invitation: 'invitation',
  membership: 'membership',
  organization: 'organization',
  publicDashboard: 'public-dashboard',
  retentionPolicy: 'retention-policy',
  site: 'site',
  trafficReport: 'traffic-report',
} as const

const getRoutes = (
  node: unknown,
  path: string[] = [],
): Array<{ contractPath: string; method: string; routePath: string }> => {
  if (isContractProcedure(node)) {
    const route = node['~orpc'].route
    if (route.method === undefined || route.path === undefined) {
      throw new Error(`Procedure at ${path.join('.')} is missing route metadata`)
    }

    return [{ contractPath: path.join('.'), method: route.method, routePath: route.path }]
  }

  if (node === null || typeof node !== 'object') return []

  return Object.entries(node).flatMap(([key, value]) => getRoutes(value, [...path, key]))
}

describe('procedure error declarations', () => {
  it('matches every route to its documented exhaustive error catalog', () => {
    expect(Object.keys(expectedErrors)).toHaveLength(76)

    for (const [path, expected] of Object.entries(expectedErrors)) {
      expect(getErrorMap(path), path).toEqual(expected)
    }
  })

  it('requires every procedure to declare an explicit success status', () => {
    expect(getMissingSuccessStatuses(contract)).toEqual([])
  })

  it('namespaces every procedure route by resource and operation', () => {
    const routes = getRoutes(contract)
    const routeKeys = new Set<string>()

    expect(routes).toHaveLength(76)

    for (const { contractPath, method, routePath } of routes) {
      const [resource, operation] = contractPath.split('.') as [keyof typeof resourcePaths, string]
      const expectedPath = `/${resourcePaths[resource]}/${operation}`
      const routeKey = `${method} ${routePath}`

      expect(routePath).toBe(expectedPath)
      expect(routeKeys.has(routeKey), routeKey).toBe(false)
      routeKeys.add(routeKey)
    }
  })
})
