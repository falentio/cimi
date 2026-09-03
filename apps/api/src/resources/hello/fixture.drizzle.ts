import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'

const createdAt = new Date('2026-08-25T00:00:00.000Z')

export type UserRow = typeof schema.TUser.$inferSelect
export type HelloRow = typeof schema.THello.$inferSelect

export function createHelloUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user_1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    image: null,
    role: null,
    banned: null,
    banReason: null,
    banExpires: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

export function createHelloRow(overrides: Partial<HelloRow> = {}): HelloRow {
  return {
    id: 'hello_1',
    name: 'Ada',
    message: 'Hello, Ada!',
    ownerId: 'user_1',
    createdAt,
    ...overrides,
  }
}

export interface HelloDrizzleFixture extends Disposable {
  readonly db: Db
}

export async function createHelloDrizzleFixture(): Promise<HelloDrizzleFixture> {
  const db = createMigratedTestDb()
  try {
    await db
      .insert(schema.TUser)
      .values([
        createHelloUserRow(),
        createHelloUserRow({ id: 'user_2', name: 'Grace', email: 'grace@example.com' }),
      ])
    return {
      db,
      [Symbol.dispose]() {
        closeDb(db)
      },
    }
  } catch (error) {
    closeDb(db)
    throw error
  }
}
