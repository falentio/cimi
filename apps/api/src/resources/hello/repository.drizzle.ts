import { and, count, desc, eq, like } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import type { HelloRepository } from './repository.ts'

export interface HelloRepositoryDrizzleDependencies {
  db: Db
}

export class HelloRepositoryDrizzle implements HelloRepository {
  private readonly db: Db

  constructor({ db }: HelloRepositoryDrizzleDependencies) {
    this.db = db
  }

  async findById(id: string): Promise<HelloRepository.Hello | undefined> {
    const rows = await this.db.select().from(schema.THello).where(eq(schema.THello.id, id)).limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toResult(row)
  }

  async findOwnerId(id: string): Promise<string | undefined> {
    const rows = await this.db
      .select({ ownerId: schema.THello.ownerId })
      .from(schema.THello)
      .where(eq(schema.THello.id, id))
      .limit(1)
    return rows[0]?.ownerId
  }

  async findMany(
    options: HelloRepository.FindManyOptions,
  ): Promise<HelloRepository.FindManyResult> {
    const conditions = []
    if (options.nameFilter !== undefined) {
      conditions.push(like(schema.THello.name, `%${options.nameFilter}%`))
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined
    const [countRow] = await this.db.select({ count: count() }).from(schema.THello).where(where)
    const rows = await this.db
      .select()
      .from(schema.THello)
      .where(where)
      .orderBy(desc(schema.THello.createdAt), desc(schema.THello.id))
      .limit(options.limit + 1)
      .offset(options.offset)
    const hasMore = rows.length > options.limit
    const items = rows.slice(0, options.limit).map(toResult)
    return {
      items,
      nextOffset: hasMore ? options.offset + options.limit : null,
      hasMore,
      totalCount: countRow?.count ?? 0,
    }
  }

  async insert(record: HelloRepository.HelloRecord): Promise<HelloRepository.Hello> {
    const rows = await this.db.insert(schema.THello).values(record).returning()
    const row = rows[0]
    if (row === undefined) throw new Error('Hello insert returned no row')
    return toResult(row)
  }

  async deleteById(id: string, ownerId: string): Promise<boolean> {
    const rows = await this.db
      .delete(schema.THello)
      .where(and(eq(schema.THello.id, id), eq(schema.THello.ownerId, ownerId)))
      .returning({ id: schema.THello.id })
    return rows.length > 0
  }
}

function toResult(row: HelloRepository.HelloRecord): HelloRepository.Hello {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  }
}
