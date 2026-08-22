import { describe, expect, it } from 'vitest'
import { createClient } from '../index.ts'

describe('createClient', () => {
  it('returns a client exposing callable procedures', () => {
    const client = createClient({ baseUrl: 'http://localhost:4321' })

    expect(client).toBeDefined()
    expect(typeof client.system.health).toBe('function')
  })
})
