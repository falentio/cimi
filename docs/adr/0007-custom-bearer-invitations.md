---
status: accepted
---

# Custom Bearer Invitations

## Context

Cimi needs Organization invitations for a self-hosted installation without
requiring an email delivery provider or making email verification part of core
operation. Better Auth's Organization plugin supports email-bound invitation
flows and an optional verified-email requirement, but Cimi's selected contract
uses a custom hashed bearer token with no target email field.

The token is intentionally a capability: the person who possesses it and has
an authenticated Cimi User may accept it. Better Auth remains the authentication
and Organization membership authority; Cimi owns the token lifecycle and must
reconcile persisted Site scope independently.

## Decision

- `acceptInvitation` requires an active authenticated User, not a verified email
  address. An unauthenticated recipient must sign up or sign in through Better
  Auth and retry the still-valid token.
- The token is transferable. A forwarded valid token grants its fixed role to
  the authenticated holder, and the token is consumed exactly once.
- Cimi stores only the token hash, validates pending/non-expired state, and
  transactionally reconciles the fixed Organization role through Better Auth.
- The invitation input remains token-only. It has no target email, email-match,
  or `emailVerified` field.
- Email delivery, email verification, invitation pages, and notification retry
  are outside the core invitation contract.

## Considered Options

- Require `emailVerified` before acceptance: rejected because it adds an email
  verification/delivery dependency without binding the bearer token to an
  intended address.
- Add a target email and require a verified match: rejected because it changes
  the custom bearer contract and makes email lifecycle part of core membership
  onboarding.
- Use Better Auth's native invitation plugin: rejected because its email-bound
  semantics do not match Cimi's intentionally transferable custom token.
- Create a User during acceptance: rejected because authentication creation and
  token consumption have different recovery and security boundaries.

## Consequences

- Self-hosted installations can accept invitations without an external email
  service or configured verification provider.
- A forwarded token is intentionally sufficient for membership acceptance, so
  token secrecy and revocation remain the inviter's security boundary.
- A valid token cannot identify an intended recipient; product surfaces must
  avoid describing it as an email invitation or recipient-bound invitation.
- Better Auth plugin settings for email-bound invitations do not automatically
  apply to this Cimi procedure.

## Compatibility Rules

Future changes must preserve these invariants:

- Unauthenticated callers receive `UNAUTHORIZED` without consuming a token.
- Invalid, expired, revoked, and replayed tokens remain indistinguishable
  `NOT_FOUND` outcomes.
- A forwarded valid token may be accepted by any authenticated User.
- Email verification is not required unless a future breaking contract adds an
  explicit target-email binding and delivery policy.
- Better Auth remains the Organization membership authority.
