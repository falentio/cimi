const SESSION_INACTIVITY_MS = 30 * 60 * 1000
const SESSION_MAX_MS = 24 * 60 * 60 * 1000

export interface SessionWindow {
  readonly inactivityMs: number
  readonly maxMs: number
}

export const DEFAULT_SESSION_WINDOW: SessionWindow = {
  inactivityMs: SESSION_INACTIVITY_MS,
  maxMs: SESSION_MAX_MS,
}

export interface SessionWindowState {
  readonly lastSeenMs: number
  readonly sessionStartMs: number
}

export function sessionContinues(
  state: SessionWindowState,
  receiptMs: number,
  window: SessionWindow = DEFAULT_SESSION_WINDOW,
): boolean {
  const inactive = receiptMs - state.lastSeenMs > window.inactivityMs
  const expired = receiptMs - state.sessionStartMs > window.maxMs
  return !inactive && !expired
}
