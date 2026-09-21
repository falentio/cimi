import { call } from '@orpc/server'
import { expect, test } from 'vitest'
import { createApiE2eFixture } from './fixture.ts'

test('persists organization governance, site configuration, and lifecycle ownership', async () => {
  await using fixture = await createApiE2eFixture()
  const owner = await fixture.createUser('governance-owner@example.com', 'Governance Owner')
  const member = await fixture.createUser('governance-member@example.com', 'Governance Member')

  const organization = await call(
    fixture.router.organization.createOrganization,
    { name: 'Governance Organization' },
    { context: await owner.context() },
  )
  const invitation = await call(
    fixture.router.invitation.createInvitation,
    { organizationId: organization.id, role: 'member' },
    { context: await owner.context() },
  )
  expect(invitation.token).toHaveLength(43)
  await expect(
    call(
      fixture.router.invitation.listInvitations,
      { organizationId: organization.id, offset: 0, limit: 20 },
      { context: await owner.context() },
    ),
  ).resolves.toMatchObject({ items: [{ id: invitation.invitation.id, status: 'pending' }] })

  await expect(
    call(
      fixture.router.invitation.acceptInvitation,
      { token: invitation.token },
      { context: await member.context() },
    ),
  ).resolves.toMatchObject({ organizationId: organization.id, role: 'member' })

  const members = await call(
    fixture.router.membership.listMembers,
    { organizationId: organization.id, offset: 0, limit: 20 },
    { context: await owner.context() },
  )
  expect(members).toMatchObject({
    totalCount: 2,
    items: expect.arrayContaining([
      expect.objectContaining({ userId: owner.userId, role: 'owner' }),
      expect.objectContaining({ userId: member.userId, role: 'member' }),
    ]),
  })

  await expect(
    call(
      fixture.router.membership.changeMemberRole,
      { organizationId: organization.id, userId: member.userId, role: 'admin' },
      { context: await owner.context() },
    ),
  ).resolves.toMatchObject({ userId: member.userId, role: 'admin' })
  await expect(
    call(
      fixture.router.membership.transferOrganizationOwnership,
      { organizationId: organization.id, userId: member.userId },
      { context: await owner.context() },
    ),
  ).resolves.toMatchObject({ userId: member.userId, role: 'owner' })
  await expect(
    call(
      fixture.router.membership.transferOrganizationOwnership,
      { organizationId: organization.id, userId: owner.userId },
      { context: await owner.context() },
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })

  const site = await call(
    fixture.router.site.createSite,
    {
      organizationId: organization.id,
      name: 'Production',
      hostname: 'governance.example.com',
    },
    { context: await member.context() },
  )
  const rotated = await call(
    fixture.router.site.rotateIngestionIdentifier,
    { siteId: site.id },
    { context: await member.context() },
  )
  expect(rotated.ingestionIdentifier).not.toBe(site.ingestionIdentifier)
  await expect(
    call(
      fixture.router.site.updateSiteV2,
      {
        siteId: site.id,
        name: 'Production Updated',
        hostname: 'governance-updated.example.com',
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
      },
      { context: await member.context() },
    ),
  ).resolves.toMatchObject({
    id: site.id,
    name: 'Production Updated',
    hostname: 'governance-updated.example.com',
  })

  const deletion = await call(
    fixture.router.site.deleteSite,
    { siteId: site.id },
    { context: await member.context() },
  )
  await fixture.waitFor({
    read: async () =>
      call(
        fixture.router.site.getSiteDeletionStatus,
        { siteId: site.id },
        { context: await member.context() },
      ),
    done: (value) => value.status === 'deleted',
    operationId: deletion.operationId,
    label: 'site deletion',
  })
  const recovered = await call(
    fixture.router.site.recoverSite,
    { siteId: site.id },
    { context: await member.context() },
  )
  expect(recovered).toMatchObject({ accepted: true, status: 'recovering' })
  await expect(
    fixture.waitFor({
      read: async () =>
        call(
          fixture.router.site.getSiteDeletionStatus,
          { siteId: site.id },
          { context: await member.context() },
        ),
      done: (value) => value.status === 'active',
      operationId: recovered.operationId,
      label: 'site recovery',
    }),
  ).resolves.toMatchObject({ siteId: site.id, status: 'active' })
}, 15_000)
