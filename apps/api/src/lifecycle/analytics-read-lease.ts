import { serviceUnavailable, type LifecycleLease, type LifecycleLock } from '@cimi/kernel'
import { toOrpcReportingError } from '../errors.ts'

/**
 * Holds the shared analytics-read boundary across a reporting read. A lifecycle mutation that
 * needs exclusive access refuses the lease, and the read fails closed instead of racing it. The
 * read error wins over a release error so a broken unlock cannot mask the caller's real failure.
 */
export async function withAnalyticsReadLease<T>(
  lock: LifecycleLock,
  run: () => Promise<T>,
): Promise<T> {
  let lease: LifecycleLease | undefined
  let outcome:
    | { readonly kind: 'success'; readonly value: T }
    | { readonly kind: 'failure'; readonly error: unknown }
  try {
    lease = await lock.acquire('analytics-read')
    if (lease === undefined) throw serviceUnavailable('lifecycle-locked')
    outcome = { kind: 'success', value: await run() }
  } catch (error) {
    outcome = { kind: 'failure', error }
  }

  let releaseError: unknown
  try {
    await lease?.release()
  } catch (error) {
    releaseError = error
  }

  if (outcome.kind === 'failure') throw toOrpcReportingError(outcome.error)
  if (releaseError !== undefined) throw toOrpcReportingError(releaseError)
  return outcome.value
}
