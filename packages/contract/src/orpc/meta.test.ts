import { describe, expect, it } from 'vitest'
import { oc } from './index.ts'

describe('procedure metadata', () => {
  it('defaults devOnly to false', () => {
    const procedure = oc.route({ method: 'GET', path: '/test' }).meta({ auth: 'public' })

    expect(procedure['~orpc'].meta).toEqual({ auth: 'public', devOnly: false })
  })

  it('allows procedures to opt into devOnly', () => {
    const procedure = oc
      .route({ method: 'GET', path: '/test' })
      .meta({ auth: 'public', devOnly: true })

    expect(procedure['~orpc'].meta.devOnly).toBe(true)
  })
})
