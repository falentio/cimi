import { describe, expect, it } from 'vitest'
import { createHelloFixture } from '../fixture.ts'
import { HelloService } from '../service.ts'

describe('HelloService.remove', () => {
  it('removes an owned greeting and hides missing or inaccessible records', async () => {
    const { service, repo } = createHelloFixture()
    repo.findOwnerId.mockImplementation(async (id) => (id === 'hello_1' ? 'user_1' : undefined))
    repo.deleteById.mockResolvedValue(true)

    await expect(service.remove({ id: 'hello_1' }, { id: 'user_1' })).resolves.toEqual({
      id: 'hello_1',
    })
    expect(repo.deleteById).toHaveBeenCalledWith('hello_1', 'user_1')
    await expect(service.remove({ id: 'hello_1' }, { id: 'user_2' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(service.remove({ id: 'missing' }, { id: 'user_1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(repo.deleteById).toHaveBeenCalledTimes(1)
  })

  it('rejects a removal when the atomic delete observes no row', async () => {
    const { service, repo } = createHelloFixture()
    repo.findOwnerId.mockResolvedValue('user_1')
    repo.deleteById.mockResolvedValueOnce(false)

    await expect(service.remove({ id: 'hello_1' }, { id: 'user_1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('wires a default guard when none is injected', async () => {
    const { repo } = createHelloFixture()
    const service = new HelloService({ repository: repo })
    repo.findOwnerId.mockResolvedValue('user_1')
    repo.deleteById.mockResolvedValue(true)

    await expect(service.remove({ id: 'hello_1' }, { id: 'user_1' })).resolves.toEqual({
      id: 'hello_1',
    })
    expect(repo.deleteById).toHaveBeenCalledWith('hello_1', 'user_1')
  })
})
