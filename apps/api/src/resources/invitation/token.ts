import { createHash, randomBytes } from 'node:crypto'

export type TokenHash = string & { readonly __brand: 'TokenHash' }

export function mintInvitationToken(): { token: string; tokenHash: TokenHash } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInvitationToken(token) }
}

export function hashInvitationToken(token: string): TokenHash {
  return createHash('sha256').update(token).digest('hex') as TokenHash
}
