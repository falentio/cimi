import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { contract } from '../../index.ts'
import { SHelloCreateInput } from './command/create.ts'
import { SHelloRemoveInput } from './command/remove.ts'
import { SHelloGetInput } from './query/get.ts'
import { SHelloListInput } from './query/list.ts'
import { SOffsetPaginationInput } from '../../schema/index.ts'
import { SHelloWorldInput } from './query/world.ts'

describe('hello contract', () => {
  it('registers all procedures with the documented RPC routes', () => {
    expect(contract.hello).toBeDefined()
    expect(contract.hello.list['~orpc'].route).toMatchObject({
      operationId: 'listHello',
      path: '/hello/list',
    })
    expect(contract.hello.get['~orpc'].route.path).toBe('/hello/get')
    expect(contract.hello.world['~orpc'].route.path).toBe('/hello/world')
    expect(contract.hello.create['~orpc'].route.path).toBe('/hello/create')
    expect(contract.hello.remove['~orpc'].route.path).toBe('/hello/remove')
  })

  it('accepts valid create, list, get, world, and remove inputs', () => {
    expect(() => v.parse(SHelloCreateInput, { name: 'Ada', message: 'Hello, Ada!' })).not.toThrow()
    expect(() => v.parse(SHelloListInput, { offset: 0, limit: 20, name: 'Ada' })).not.toThrow()
    expect(() => v.parse(SHelloGetInput, { id: 'hel_1' })).not.toThrow()
    expect(() => v.parse(SHelloWorldInput, { name: 'Ada' })).not.toThrow()
    expect(() => v.parse(SHelloRemoveInput, { id: 'hel_1' })).not.toThrow()
  })

  it('rejects empty messages and unknown input keys', () => {
    expect(() => v.parse(SHelloCreateInput, { name: 'Ada', message: '' })).toThrow(v.ValiError)
    expect(() =>
      v.parse(SHelloCreateInput, { name: 'Ada', message: 'Hello, Ada!', ownerId: 'user_1' }),
    ).toThrow(v.ValiError)
  })

  it('accepts numeric query pagination values and rejects invalid values', () => {
    expect(v.parse(SOffsetPaginationInput, { offset: '2', limit: '10' })).toEqual({
      offset: 2,
      limit: 10,
    })
    expect(() => v.parse(SHelloListInput, { offset: -1 })).toThrow(v.ValiError)
    expect(() => v.parse(SHelloListInput, { limit: 101 })).toThrow(v.ValiError)
    expect(() => v.parse(SHelloListInput, { offset: '' })).toThrow(v.ValiError)
    expect(() => v.parse(SHelloListInput, { limit: '1.5' })).toThrow(v.ValiError)
  })
})
