import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import { evaluateAdmission, sanitizeProperties, sanitizeUrls } from '../evaluator.ts'
import { createPolicyLayers, createDecisionFixture } from '../fixture.ts'
import { resolvePolicy, validatePolicyCombination, type PolicyValues } from '../model.ts'

const defaults = schema.DEFAULT_COLLECTION_POLICY

function policyWith(overrides: Partial<PolicyValues>): PolicyValues {
  return {
    ...defaults,
    ...overrides,
    urlPolicy: { ...defaults.urlPolicy, ...overrides.urlPolicy },
    propertyPolicy: { ...defaults.propertyPolicy, ...overrides.propertyPolicy },
    exclusions: { ...defaults.exclusions, ...overrides.exclusions },
  }
}

describe('collection policy resolution', () => {
  it('inherits every field from the installation without a Site override', () => {
    const resolution = resolvePolicy({ siteId: 'ste_1', layers: createPolicyLayers() })

    expect(resolution.effective).toMatchObject({
      scope: 'site',
      siteId: 'ste_1',
      values: defaults,
    })
    expect(Object.values(resolution.provenance)).toEqual(Array(9).fill('installation'))
  })

  it('uses the Site layer and records field provenance', () => {
    const site = policyWith({ consentMode: 'required_for_all', captureQueryStrings: true })
    const resolution = resolvePolicy({
      siteId: 'ste_1',
      layers: createPolicyLayers(defaults, site),
    })

    expect(resolution.effective.values).toEqual(site)
    expect(resolution.siteOverride).toEqual(site)
    expect(Object.values(resolution.provenance)).toEqual(Array(9).fill('site'))
  })

  it('rejects duplicate policy registry values and contradictory URL settings', () => {
    expect(() =>
      validatePolicyCombination(
        policyWith({
          profileFilterKeys: ['account_id', 'account_id'],
        }),
      ),
    ).toThrow('profileFilterKeys')
    expect(() => validatePolicyCombination(policyWith({ captureQueryStrings: true }))).toThrow(
      'Query strings',
    )
  })
})

describe('collection policy admission evaluation', () => {
  it.each([
    [{}, 'anonymous'],
    [{ collectionContext: { consent: 'denied' as const } }, 'anonymous'],
    [
      { identifiedUserId: 'usr_1', collectionContext: { consent: 'granted' as const } },
      'identified',
    ],
  ])('handles required_for_identity consent as %s', (input, identity) => {
    const decision = evaluateAdmission({
      resolution: resolvePolicy({ siteId: 'ste_1', layers: createPolicyLayers() }),
      input: { siteId: 'ste_1', ...input },
      evaluatedAt: new Date('2026-09-05T00:00:00.000Z'),
    })

    expect(decision.outcome).toMatchObject({ kind: 'accepted', identity })
  })

  it('requires granted consent for all collection in required_for_all mode', () => {
    const resolution = resolvePolicy({
      siteId: 'ste_1',
      layers: createPolicyLayers(policyWith({ consentMode: 'required_for_all' })),
    })

    expect(
      evaluateAdmission({
        resolution,
        input: { siteId: 'ste_1' },
        evaluatedAt: new Date(),
      }).outcome,
    ).toEqual({ kind: 'rejected', reason: 'consent' })
    expect(
      evaluateAdmission({
        resolution,
        input: { siteId: 'ste_1', collectionContext: { consent: 'granted' } },
        evaluatedAt: new Date(),
      }).outcome,
    ).toMatchObject({ kind: 'accepted' })
  })

  it('allows omitted consent in none mode but rejects explicit denial', () => {
    const resolution = resolvePolicy({
      siteId: 'ste_1',
      layers: createPolicyLayers(policyWith({ consentMode: 'none' })),
    })

    expect(
      evaluateAdmission({ resolution, input: { siteId: 'ste_1' }, evaluatedAt: new Date() })
        .outcome,
    ).toMatchObject({ kind: 'accepted' })
    expect(
      evaluateAdmission({
        resolution,
        input: { siteId: 'ste_1', collectionContext: { consent: 'denied' } },
        evaluatedAt: new Date(),
      }).outcome,
    ).toEqual({ kind: 'rejected', reason: 'consent' })
  })

  it('keeps an explicit identity reference anonymous without opt-in', () => {
    const resolution = resolvePolicy({
      siteId: 'ste_1',
      layers: createPolicyLayers(policyWith({ consentMode: 'none' })),
    })

    expect(
      evaluateAdmission({
        resolution,
        input: { siteId: 'ste_1', identifiedUserId: 'usr_1' },
        evaluatedAt: new Date(),
      }).outcome,
    ).toMatchObject({ kind: 'accepted', identity: 'anonymous', identifiedUserId: null })
  })

  it('rejects identify without granted consent', () => {
    const resolution = resolvePolicy({ siteId: 'ste_1', layers: createPolicyLayers() })

    expect(
      evaluateAdmission({
        resolution,
        input: { siteId: 'ste_1', operation: 'identify', identifiedUserId: 'usr_1' },
        evaluatedAt: new Date(),
      }).outcome,
    ).toEqual({ kind: 'rejected', reason: 'consent' })
  })

  it('honors or ignores GPC and DNT from the effective policy', () => {
    const honored = resolvePolicy({ siteId: 'ste_1', layers: createPolicyLayers() })
    const ignored = resolvePolicy({
      siteId: 'ste_1',
      layers: createPolicyLayers(policyWith({ honorGpcDnt: false })),
    })
    const input = { siteId: 'ste_1', collectionContext: { gpc: true } }

    expect(
      evaluateAdmission({ resolution: honored, input, evaluatedAt: new Date() }).outcome,
    ).toEqual({ kind: 'rejected', reason: 'gpc_dnt' })
    expect(
      evaluateAdmission({ resolution: ignored, input, evaluatedAt: new Date() }).outcome,
    ).toMatchObject({ kind: 'accepted' })
  })

  it('applies exclusions before identity assignment', () => {
    const resolution = resolvePolicy({
      siteId: 'ste_1',
      layers: createPolicyLayers(
        policyWith({ exclusions: { ...defaults.exclusions, paths: ['/private'] } }),
      ),
    })

    expect(
      evaluateAdmission({
        resolution,
        input: {
          siteId: 'ste_1',
          path: '/private/account',
          identifiedUserId: 'usr_1',
          collectionContext: { consent: 'granted' },
        },
        evaluatedAt: new Date(),
      }).outcome,
    ).toEqual({ kind: 'rejected', reason: 'exclusion' })
  })

  it('matches IPv6 exclusions through the shared IP matcher', () => {
    const resolution = resolvePolicy({
      siteId: 'ste_1',
      layers: createPolicyLayers(
        policyWith({
          exclusions: {
            ...defaults.exclusions,
            ipRanges: ['2001:db8::/32'],
          },
        }),
      ),
    })

    expect(
      evaluateAdmission({
        resolution,
        input: { siteId: 'ste_1', ip: '2001:db8::1' },
        evaluatedAt: new Date(),
      }).outcome,
    ).toEqual({ kind: 'rejected', reason: 'exclusion' })
  })

  it('normalizes bot outcomes', () => {
    for (const [botPolicy, expected] of [
      ['exclude', { kind: 'rejected', reason: 'bot' }],
      ['include', { kind: 'accepted', bot: 'included' }],
      ['record_excluded', { kind: 'accepted', bot: 'recorded_excluded' }],
    ] as const) {
      const resolution = resolvePolicy({
        siteId: 'ste_1',
        layers: createPolicyLayers(policyWith({ botPolicy })),
      })
      expect(
        evaluateAdmission({
          resolution,
          input: { siteId: 'ste_1', isBot: true },
          evaluatedAt: new Date(),
        }).outcome,
      ).toMatchObject(expected)
    }
  })

  it('sanitizes URL and scalar property values', () => {
    const policy = policyWith({
      captureQueryStrings: true,
      urlPolicy: { ...defaults.urlPolicy, stripQueryStrings: false },
      propertyPolicy: {
        ...defaults.propertyPolicy,
        maxProperties: 1,
        maxValueLength: 3,
        reservedNames: ['secret'],
      },
    })
    expect(
      sanitizeUrls({
        url: 'https://example.com/path?campaign=spring&token=hidden',
        referrer: 'https://ref.example/from?source=ad',
        policy,
      }),
    ).toEqual({
      path: '/path?campaign=spring',
      referrer: 'https://ref.example/from?source=ad',
    })
    expect(
      sanitizeProperties({ secret: 'no', name: 'long', nested: { value: true } }, policy),
    ).toEqual({ name: 'lon' })
  })

  it('snapshots the revision, values, outcome, and evaluation time', () => {
    const decision = createDecisionFixture()

    expect(decision).toMatchObject({
      revision: { id: 'cpr_installation_1', version: 1, target: { scope: 'installation' } },
      outcome: { kind: 'accepted' },
      evaluatedAt: '2026-09-05T00:00:00.000Z',
    })
    expect(Object.isFrozen(decision)).toBe(true)
    expect(Object.isFrozen(decision.revision.target)).toBe(true)
    expect(Object.isFrozen(decision.values)).toBe(true)
    expect(Object.isFrozen(decision.outcome)).toBe(true)
  })
})
