import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { TUser } from './auth.ts'

export const THello = sqliteTable('hello', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  message: text('message').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => TUser.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
