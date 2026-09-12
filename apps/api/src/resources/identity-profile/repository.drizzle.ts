import { and, asc, count, desc, eq, gte, isNull, max, ne, or } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import { parse, safeParse } from 'valibot'
import {
  PROFILE_EPOCH_HISTORY_MAX,
  PROFILE_EPOCH_NUMBER_MAX,
  hasAllowedProfileTraitKeys,
  isProfileTraitsPayloadOversized,
  SProfileTraits,
} from '@cimi/contract'
import { generateId } from '@cimi/utils'
import { sessionContinues } from '../event-ingestion/session-window.ts'
import type {
  ActiveIdentityProfile,
  IdentityProfile,
  IdentityDeletionStatus,
  IdentityProfileIdFactory,
  IdentityProfileEpoch,
  IdentityProfileList,
  IdentityProfileRepository,
} from './repository.ts'

export interface IdentityProfileRepositoryDrizzleDependencies {
  readonly db: Db
  readonly ids?: IdentityProfileIdFactory | undefined
}

export class IdentityProfileRepositoryDrizzle implements IdentityProfileRepository {
  private readonly db: Db
  private readonly ids: IdentityProfileIdFactory

  constructor({ db, ids }: IdentityProfileRepositoryDrizzleDependencies) {
    this.db = db
    this.ids = ids ?? {
      identityProfileId: () => generateId('ipr'),
      identityLinkId: () => generateId('ilk'),
      identityRedactionId: () => generateId('ird'),
    }
  }

  async identify(
    input: IdentityProfileRepository.IdentifyInput,
  ): Promise<IdentityProfileRepository.IdentifyResult> {
    try {
      return this.db.transaction((tx) => identifyInTransaction(tx, input, this.ids))
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' }
      throw error
    }
  }

  async find(input: IdentityProfileRepository.FindInput): Promise<IdentityProfile | undefined> {
    const row = await this.findRow(input)
    if (row === undefined || isActivityExpired(row, input.profileActivityCutoffAt)) return undefined
    return toProfile(this.db, row)
  }

  async list(input: IdentityProfileRepository.ListInput): Promise<IdentityProfileList> {
    const activityVisible =
      input.profileActivityCutoffAt === undefined
        ? undefined
        : or(
            ne(schema.TIdentityProfile.status, 'active'),
            gte(schema.TIdentityProfile.lastSeenAt, input.profileActivityCutoffAt),
          )
    const where = and(eq(schema.TIdentityProfile.siteId, input.siteId), activityVisible)
    const [countRow, rows] = await Promise.all([
      this.db.select({ count: count() }).from(schema.TIdentityProfile).where(where),
      this.db
        .select()
        .from(schema.TIdentityProfile)
        .where(where)
        .orderBy(
          asc(schema.TIdentityProfile.createdAt),
          asc(schema.TIdentityProfile.identifiedUserId),
          asc(schema.TIdentityProfile.profileId),
        )
        .limit(input.limit + 1)
        .offset(input.offset),
    ])
    const hasMore = rows.length > input.limit
    return {
      items: rows.slice(0, input.limit).map((row) => toProfile(this.db, row)),
      nextOffset: hasMore ? input.offset + input.limit : null,
      hasMore,
      totalCount: countRow[0]?.count ?? 0,
    }
  }

  async getDeletionStatus(
    input: IdentityProfileRepository.FindInput,
  ): Promise<IdentityDeletionStatus | undefined> {
    const row = await this.findRow(input)
    if (row === undefined) return undefined
    const redaction =
      row.profileEpoch === null
        ? undefined
        : await this.db
            .select()
            .from(schema.TIdentityRedaction)
            .where(
              and(
                eq(schema.TIdentityRedaction.siteId, input.siteId),
                eq(schema.TIdentityRedaction.identifiedUserId, input.identifiedUserId),
                eq(schema.TIdentityRedaction.profileEpoch, row.profileEpoch),
              ),
            )
            .limit(1)
            .then((rows) => rows[0])
    return {
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      derivedCleanup: cleanupStatus(
        redaction?.derivedCleanupStatus ?? 'not-required',
        redaction?.derivedCleanupUpdatedAt ?? row.updatedAt,
      ),
      backupCleanup: cleanupStatus(
        redaction?.backupCleanupStatus ?? 'not-required',
        redaction?.backupCleanupUpdatedAt ?? row.updatedAt,
      ),
    }
  }

  async requestDeletion(
    input: IdentityProfileRepository.RequestDeletionInput,
  ): Promise<IdentityProfileRepository.RequestDeletionResult> {
    try {
      return this.db.transaction((tx) => {
        const profile = selectProfile(tx, input)
        if (profile === undefined) return { kind: 'not-found' }
        if (profile.status !== 'active' || profile.profileEpoch === null)
          return { kind: 'conflict' }

        const currentEpoch = selectEpoch(tx, profile.profileId, profile.profileEpoch)
        if (currentEpoch === undefined || currentEpoch.status !== 'active')
          return { kind: 'conflict' }

        tx.insert(schema.TIdentityRedaction)
          .values({
            id: this.ids.identityRedactionId(),
            siteId: input.siteId,
            profileId: profile.profileId,
            identifiedUserId: input.identifiedUserId,
            profileEpoch: profile.profileEpoch,
            reason: 'explicit',
            status: 'requested',
            requestedAt: input.now,
            appliedAt: null,
            derivedCleanupStatus: 'pending',
            backupCleanupStatus: 'pending',
            derivedCleanupUpdatedAt: input.now,
            backupCleanupUpdatedAt: input.now,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .run()
        tx.update(schema.TIdentityLink)
          .set({ unlinkedAt: input.now })
          .where(
            and(
              eq(schema.TIdentityLink.profileId, profile.profileId),
              eq(schema.TIdentityLink.profileEpoch, profile.profileEpoch),
              isNull(schema.TIdentityLink.unlinkedAt),
            ),
          )
          .run()
        tx.update(schema.TIdentityProfile)
          .set({ status: 'deletion-requested', updatedAt: input.now })
          .where(eq(schema.TIdentityProfile.profileId, profile.profileId))
          .run()
        return {
          kind: 'accepted',
          output: { accepted: true, status: 'deletion-requested' },
        }
      })
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' }
      throw error
    }
  }

  private async findRow(input: IdentityProfileRepository.FindInput) {
    const rows = await this.db
      .select()
      .from(schema.TIdentityProfile)
      .where(
        and(
          eq(schema.TIdentityProfile.siteId, input.siteId),
          eq(schema.TIdentityProfile.identifiedUserId, input.identifiedUserId),
        ),
      )
      .limit(1)
    return rows[0]
  }
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]
type ProfileRow = typeof schema.TIdentityProfile.$inferSelect
type ProfileEpochRow = typeof schema.TIdentityProfileEpoch.$inferSelect

function identifyInTransaction(
  tx: SqliteTransaction,
  input: IdentityProfileRepository.IdentifyInput,
  ids: IdentityProfileIdFactory,
): IdentityProfileRepository.IdentifyResult {
  const profile = selectProfile(tx, input)
  if (profile === undefined) {
    const mergedTraits = mergeTraits(null, input.traits)
    if (mergedTraits.kind !== 'valid') return mergedTraits
    const profileId = ids.identityProfileId()
    insertProfile(tx, {
      profileId,
      siteId: input.siteId,
      identifiedUserId: input.identifiedUserId,
      traits: mergedTraits.value,
      epoch: 1,
      now: input.now,
    })
    linkAlias(tx, {
      ...input,
      profileId,
      profileEpoch: 1,
      ids,
    })
    return accepted(input.identifiedUserId, input.now)
  }

  if (profile.status === 'active') {
    if (profile.profileEpoch === null) return { kind: 'conflict' }
    if (isActivityExpired(profile, input.profileActivityCutoffAt)) return { kind: 'conflict' }
    const mergedTraits = mergeTraits(parseTraits(profile.traits), input.traits)
    if (mergedTraits.kind !== 'valid') return mergedTraits
    const traits = mergedTraits.value
    tx.update(schema.TIdentityProfile)
      .set({
        traits,
        lastSeenAt: laterDate(profile.lastSeenAt, input.now),
        updatedAt: input.now,
      })
      .where(eq(schema.TIdentityProfile.profileId, profile.profileId))
      .run()
    linkAlias(tx, {
      ...input,
      profileId: profile.profileId,
      profileEpoch: profile.profileEpoch,
      ids,
    })
    return accepted(input.identifiedUserId, input.now)
  }

  if (profile.status === 'deleted') {
    if (profile.profileEpoch === null) return { kind: 'conflict' }
    const oldEpoch = selectEpoch(tx, profile.profileId, profile.profileEpoch)
    const redaction = selectRedaction(tx, profile)
    if (
      oldEpoch?.status !== 'redacted' ||
      redaction === undefined ||
      !cleanupComplete(redaction.derivedCleanupStatus) ||
      !cleanupComplete(redaction.backupCleanupStatus)
    )
      return { kind: 'conflict' }
    const maxEpoch =
      tx
        .select({ epoch: max(schema.TIdentityProfileEpoch.epoch) })
        .from(schema.TIdentityProfileEpoch)
        .where(eq(schema.TIdentityProfileEpoch.profileId, profile.profileId))
        .all()[0]?.epoch ?? profile.profileEpoch
    const nextEpoch = maxEpoch + 1
    if (nextEpoch > PROFILE_EPOCH_NUMBER_MAX) return { kind: 'conflict' }
    const mergedTraits = mergeTraits(null, input.traits)
    if (mergedTraits.kind !== 'valid') return mergedTraits
    const traits = mergedTraits.value
    tx.insert(schema.TIdentityProfileEpoch)
      .values({
        profileId: profile.profileId,
        siteId: input.siteId,
        identifiedUserId: input.identifiedUserId,
        epoch: nextEpoch,
        status: 'active',
        startedAt: input.now,
        endedAt: null,
        redactedAt: null,
      })
      .run()
    tx.update(schema.TIdentityProfile)
      .set({
        status: 'active',
        profileEpoch: nextEpoch,
        traits,
        lastSeenAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(schema.TIdentityProfile.profileId, profile.profileId))
      .run()
    linkAlias(tx, {
      ...input,
      profileId: profile.profileId,
      profileEpoch: nextEpoch,
      ids,
    })
    return accepted(input.identifiedUserId, input.now)
  }

  return { kind: 'conflict' }
}

function insertProfile(
  tx: SqliteTransaction,
  input: {
    readonly profileId: string
    readonly siteId: string
    readonly identifiedUserId: string
    readonly traits: ActiveIdentityProfile['traits']
    readonly epoch: number
    readonly now: Date
  },
): void {
  tx.insert(schema.TIdentityProfile)
    .values({
      profileId: input.profileId,
      siteId: input.siteId,
      identifiedUserId: input.identifiedUserId,
      status: 'active',
      profileEpoch: input.epoch,
      traits: input.traits,
      firstSeenAt: input.now,
      lastSeenAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .run()
  tx.insert(schema.TIdentityProfileEpoch)
    .values({
      profileId: input.profileId,
      siteId: input.siteId,
      identifiedUserId: input.identifiedUserId,
      epoch: input.epoch,
      status: 'active',
      startedAt: input.now,
      endedAt: null,
      redactedAt: null,
    })
    .run()
}

function linkAlias(
  tx: SqliteTransaction,
  input: IdentityProfileRepository.IdentifyInput & {
    readonly profileId: string
    readonly profileEpoch: number
    readonly ids: IdentityProfileIdFactory
  },
): void {
  if (input.anonymousIdentityId === undefined) return
  const current = tx
    .select()
    .from(schema.TIdentityLink)
    .where(
      and(
        eq(schema.TIdentityLink.siteId, input.siteId),
        eq(schema.TIdentityLink.anonymousIdentityId, input.anonymousIdentityId),
        isNull(schema.TIdentityLink.unlinkedAt),
      ),
    )
    .limit(1)
    .all()[0]
  if (current !== undefined) {
    if (current.profileId === input.profileId && current.profileEpoch === input.profileEpoch) return
    tx.update(schema.TIdentityLink)
      .set({ unlinkedAt: input.now })
      .where(eq(schema.TIdentityLink.id, current.id))
      .run()
  }
  const sessionStart = current === undefined ? resolveSessionStart(tx, input) : input.now
  tx.insert(schema.TIdentityLink)
    .values({
      id: input.ids.identityLinkId(),
      siteId: input.siteId,
      profileId: input.profileId,
      profileEpoch: input.profileEpoch,
      anonymousIdentityId: input.anonymousIdentityId,
      analyticsSessionId: null,
      effectiveFrom: sessionStart,
      linkedAt: input.now,
      unlinkedAt: null,
    })
    .run()
}

function resolveSessionStart(
  tx: SqliteTransaction,
  input: IdentityProfileRepository.IdentifyInput,
): Date {
  if (input.anonymousIdentityId === undefined) return input.now
  const latest = tx
    .select({
      eventPk: schema.TAcceptedEvent.eventPk,
      analyticsSessionId: schema.TAcceptedEvent.analyticsSessionId,
      receiptTime: schema.TAcceptedEvent.receiptTime,
    })
    .from(schema.TAcceptedEvent)
    .where(
      and(
        eq(schema.TAcceptedEvent.siteId, input.siteId),
        eq(schema.TAcceptedEvent.anonymousIdentityId, input.anonymousIdentityId),
      ),
    )
    .orderBy(desc(schema.TAcceptedEvent.receiptTime), desc(schema.TAcceptedEvent.eventPk))
    .limit(1)
    .all()[0]
  if (latest === undefined) return input.now
  const sessionStart =
    latest.analyticsSessionId === null
      ? latest.receiptTime
      : (tx
          .select({ receiptTime: schema.TAcceptedEvent.receiptTime })
          .from(schema.TAcceptedEvent)
          .where(
            and(
              eq(schema.TAcceptedEvent.siteId, input.siteId),
              eq(schema.TAcceptedEvent.anonymousIdentityId, input.anonymousIdentityId),
              eq(schema.TAcceptedEvent.analyticsSessionId, latest.analyticsSessionId),
            ),
          )
          .orderBy(asc(schema.TAcceptedEvent.receiptTime), asc(schema.TAcceptedEvent.eventPk))
          .limit(1)
          .all()[0]?.receiptTime ?? latest.receiptTime)
  const anchored = sessionContinues(
    { sessionStartMs: sessionStart.getTime(), lastSeenMs: latest.receiptTime.getTime() },
    input.now.getTime(),
  )
    ? sessionStart
    : input.now
  const redactedThrough =
    tx
      .select({ endedAt: schema.TIdentityProfileEpoch.endedAt })
      .from(schema.TIdentityProfileEpoch)
      .where(
        and(
          eq(schema.TIdentityProfileEpoch.siteId, input.siteId),
          eq(schema.TIdentityProfileEpoch.identifiedUserId, input.identifiedUserId),
          eq(schema.TIdentityProfileEpoch.status, 'redacted'),
        ),
      )
      .orderBy(desc(schema.TIdentityProfileEpoch.endedAt))
      .limit(1)
      .all()[0]?.endedAt ?? null
  return redactedThrough !== null && redactedThrough > anchored ? redactedThrough : anchored
}

function selectProfile(
  db: SqliteTransaction,
  input: IdentityProfileRepository.FindInput,
): ProfileRow | undefined {
  return db
    .select()
    .from(schema.TIdentityProfile)
    .where(
      and(
        eq(schema.TIdentityProfile.siteId, input.siteId),
        eq(schema.TIdentityProfile.identifiedUserId, input.identifiedUserId),
      ),
    )
    .limit(1)
    .all()[0]
}

function selectEpoch(
  db: SqliteTransaction,
  profileId: string,
  epoch: number,
): ProfileEpochRow | undefined {
  return db
    .select()
    .from(schema.TIdentityProfileEpoch)
    .where(
      and(
        eq(schema.TIdentityProfileEpoch.profileId, profileId),
        eq(schema.TIdentityProfileEpoch.epoch, epoch),
      ),
    )
    .limit(1)
    .all()[0]
}

function selectRedaction(db: SqliteTransaction, profile: ProfileRow) {
  if (profile.profileEpoch === null) return undefined
  return db
    .select()
    .from(schema.TIdentityRedaction)
    .where(
      and(
        eq(schema.TIdentityRedaction.profileId, profile.profileId),
        eq(schema.TIdentityRedaction.profileEpoch, profile.profileEpoch),
      ),
    )
    .limit(1)
    .all()[0]
}

function toProfile(db: Db | SqliteTransaction, row: ProfileRow): IdentityProfile {
  switch (row.status) {
    case 'deletion-requested':
      return { status: 'deletion-requested' }
    case 'deleting':
      return { status: 'deleting' }
    case 'deleted':
      return { status: 'deleted' }
    case 'active': {
      if (row.profileEpoch === null) throw new Error('Active identity profile has no epoch')
      const history = db
        .select()
        .from(schema.TIdentityProfileEpoch)
        .where(eq(schema.TIdentityProfileEpoch.profileId, row.profileId))
        .orderBy(asc(schema.TIdentityProfileEpoch.epoch))
        .all()
        .slice(-PROFILE_EPOCH_HISTORY_MAX)
        .map(toEpoch)
      if (history.length === 0) throw new Error('Active identity profile has no epoch history')
      const aliases = db
        .select({ anonymousIdentityId: schema.TIdentityLink.anonymousIdentityId })
        .from(schema.TIdentityLink)
        .where(
          and(
            eq(schema.TIdentityLink.profileId, row.profileId),
            eq(schema.TIdentityLink.profileEpoch, row.profileEpoch),
            isNull(schema.TIdentityLink.unlinkedAt),
          ),
        )
        .orderBy(asc(schema.TIdentityLink.effectiveFrom), asc(schema.TIdentityLink.id))
        .all()
        .map(({ anonymousIdentityId }) => anonymousIdentityId)
        .slice(-128)
      return {
        siteId: row.siteId,
        identifiedUserId: row.identifiedUserId,
        traits: parseTraits(row.traits),
        aliases,
        profileEpoch: row.profileEpoch,
        identityHistory: history,
        status: 'active',
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    }
    default: {
      const exhaustive: never = row.status
      return exhaustive
    }
  }
}

function toEpoch(row: ProfileEpochRow): IdentityProfileEpoch {
  if (row.status === 'active') {
    if (row.endedAt !== null) throw new Error('Active identity epoch is ended')
    return {
      epoch: row.epoch,
      status: 'active',
      startedAt: row.startedAt.toISOString(),
      endedAt: null,
    }
  }
  if (row.endedAt === null) throw new Error('Redacted identity epoch is not ended')
  return {
    epoch: row.epoch,
    status: 'redacted',
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt.toISOString(),
  }
}

function parseTraits(value: ProfileRow['traits']): ActiveIdentityProfile['traits'] {
  if (value === null) return null
  return parse(SProfileTraits, value)
}

function mergeTraits(
  current: ActiveIdentityProfile['traits'],
  incoming: IdentityProfileRepository.IdentifyInput['traits'],
):
  | { readonly kind: 'valid'; readonly value: ActiveIdentityProfile['traits'] }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'payload-too-large' } {
  if (incoming === undefined) return { kind: 'valid', value: current }
  const next = { ...current }
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null) delete next[key]
    else next[key] = value
  }
  if (Object.keys(next).length === 0) return { kind: 'valid', value: null }
  if (!hasAllowedProfileTraitKeys(next)) return { kind: 'invalid' }
  const parsed = safeParse(SProfileTraits, next)
  if (parsed.success) return { kind: 'valid', value: parsed.output }
  return isProfileTraitsPayloadOversized(next) ? { kind: 'payload-too-large' } : { kind: 'invalid' }
}

function accepted(identifiedUserId: string, now: Date): IdentityProfileRepository.IdentifyResult {
  return {
    kind: 'accepted',
    output: { identifiedUserId, status: 'active', updatedAt: now.toISOString() },
  }
}

function laterDate(first: Date, second: Date): Date {
  return first.getTime() >= second.getTime() ? first : second
}

function cleanupComplete(status: 'not-required' | 'pending' | 'complete'): boolean {
  return status !== 'pending'
}

function cleanupStatus(status: 'not-required' | 'pending' | 'complete', updatedAt: Date) {
  return { status, updatedAt: updatedAt.toISOString() }
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique|foreign key/i.test(error.message)
}

function isActivityExpired(row: ProfileRow, cutoff: Date | undefined): boolean {
  return row.status === 'active' && cutoff !== undefined && row.lastSeenAt < cutoff
}
