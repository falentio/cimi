import { createHash, randomBytes } from 'node:crypto'

export interface PublicDashboardIdentifier {
  readonly identifier: string
  readonly hash: string
}

export function mintPublicDashboardIdentifier(): PublicDashboardIdentifier {
  const identifier = randomBytes(32).toString('base64url')
  return { identifier, hash: hashPublicDashboardIdentifier(identifier) }
}

export function hashPublicDashboardIdentifier(identifier: string): string {
  return createHash('sha256').update(identifier).digest('hex')
}
