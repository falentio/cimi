import { createHash, randomBytes } from 'node:crypto'

export type TokenHash = string & { readonly __brand: 'TokenHash' }

export function mintInvitationToken() {
  const token = randomBytes(32).toString('base64url')

  return { token, tokenHash: hashInvitationToken(token) }
}

export function hashInvitationToken(token: string): TokenHash {
  // SAFETY: sha256 hex digest is the canonical TokenHash representation by construction.
  return createHash('sha256').update(token).digest('hex') as TokenHash
}
