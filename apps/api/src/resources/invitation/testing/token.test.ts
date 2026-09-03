import { describe, expect, it } from 'vitest'
import { hashInvitationToken, mintInvitationToken } from '../token.ts'

describe('invitation tokens', () => {
  it('mints a unique bearer token with a stable sha256 hash', () => {
    const first = mintInvitationToken()
    const second = mintInvitationToken()

    expect(first.token).not.toBe(second.token)
    expect(first.tokenHash).toBe(hashInvitationToken(first.token))
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashes distinct tokens to distinct hashes', () => {
    expect(hashInvitationToken('token-a')).not.toBe(hashInvitationToken('token-b'))
  })
})
