import { backupRestore } from './contract/backup-restore/index.ts'
import { cohortRetention } from './contract/cohort-retention/index.ts'
import { collectionPolicy } from './contract/collection-policy/index.ts'
import { eventIngestion } from './contract/event-ingestion/index.ts'
import { eventReport } from './contract/event-report/index.ts'
import { funnel } from './contract/funnel/index.ts'
import { goal } from './contract/goal/index.ts'
import { health } from './contract/health/index.ts'
import { identityProfile } from './contract/identity-profile/index.ts'
import { installation } from './contract/installation/index.ts'
import { invitation } from './contract/invitation/index.ts'
import { membership } from './contract/membership/index.ts'
import { organization } from './contract/organization/index.ts'
import { publicDashboard } from './contract/public-dashboard/index.ts'
import { retentionPolicy } from './contract/retention-policy/index.ts'
import { site } from './contract/site/index.ts'
import { trafficReport } from './contract/traffic-report/index.ts'

export const contract = {
  backupRestore,
  cohortRetention,
  collectionPolicy,
  eventIngestion,
  eventReport,
  funnel,
  goal,
  health,
  identityProfile,
  installation,
  invitation,
  membership,
  organization,
  publicDashboard,
  retentionPolicy,
  site,
  trafficReport,
}
