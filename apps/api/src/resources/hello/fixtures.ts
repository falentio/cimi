import { sql } from 'drizzle-orm'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { vi } from 'vitest'
import { HelloGuard } from './guard.ts'
import type { HelloRepository } from './repository.ts'
import { HelloService } from './service.ts'

const createdAt = '2026-08-25T00:00:00.000Z'

export function createHelloFixture() {
  const findById = vi.fn(async (id: string) => (id === 'hello_1' ? createHello() : undefined))
  const findOwnerId = vi.fn(async (id: string) => (id === 'hello_1' ? 'user_1' : undefined))
  const findMany = vi.fn(
    async (_options: HelloRepository.FindManyOptions): Promise<HelloRepository.FindManyResult> => ({
      items: [],
      nextOffset: null,
      hasMore: false,
      totalCount: 0,
    }),
  )
  const insert = vi.fn(async (record: HelloRepository.HelloRecord) => ({
    ...record,
    createdAt: record.createdAt.toISOString(),
  }))
  const deleteById = vi.fn(async (_id: string, _ownerId: string) => true)
  const repo: HelloRepository = { findById, findOwnerId, findMany, insert, deleteById }
  const guard = new HelloGuard(repo)
  const service = new HelloService(repo, guard)
  return { repo, guard, service, findById, findOwnerId, findMany, insert, deleteById }
}

export function createHello(overrides: Partial<HelloRepository.Hello> = {}): HelloRepository.Hello {
  return {
    id: 'hello_1',
    ownerId: 'user_1',
    name: 'Ada',
    message: 'Hello, Ada!',
    createdAt,
    ...overrides,
  }
}

export function createHelloRecord(
  overrides: Partial<HelloRepository.HelloRecord> = {},
): HelloRepository.HelloRecord {
  return {
    ...createHello(),
    createdAt: new Date(createdAt),
    ...overrides,
  }
}

export async function createHelloDbFixture() {
  const db = createMigratedTestDb()
  try {
    await db.insert(schema.TUser).values([
      {
        id: 'user_1',
        name: 'Ada',
        email: 'ada@example.com',
        emailVerified: true,
        image: null,
        role: null,
        banned: null,
        banReason: null,
        banExpires: null,
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
      },
      {
        id: 'user_2',
        name: 'Grace',
        email: 'grace@example.com',
        emailVerified: true,
        image: null,
        role: null,
        banned: null,
        banReason: null,
        banExpires: null,
        createdAt: new Date(createdAt),
        updatedAt: new Date(createdAt),
      },
    ])
    return { db }
  } catch (error) {
    closeDb(db)
    throw error
  }
}

export function clearHello(db: Db) {
  return db.run(sql`DELETE FROM hello`)
}

export function destroyHelloDbFixture({ db }: { db: Db }) {
  closeDb(db)
}
