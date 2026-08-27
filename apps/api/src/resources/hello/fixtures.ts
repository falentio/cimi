import { sql } from 'drizzle-orm'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { mock } from 'vitest-mock-extended'
import { HelloGuard } from './guard.ts'
import type { HelloRepository } from './repository.ts'
import { HelloService } from './service.ts'

const createdAt = '2026-08-25T00:00:00.000Z'

export function createHelloFixture() {
  const repo = mock<HelloRepository>()
  const guard = new HelloGuard(repo)
  const service = new HelloService({ repository: repo, guard })
  return { repo, guard, service }
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
