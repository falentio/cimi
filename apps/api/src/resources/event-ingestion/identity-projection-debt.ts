import type { Db } from '@cimi/db'

export interface IdentityProjectionDebt {
  mark(input: { siteId?: string | undefined; now: Date }): void
  clear(input: { now: Date }): void
  hasPending(): boolean
  isStale(projectedAt: Date): boolean
}

export function createIdentityProjectionDebt({ db }: { readonly db: Db }): IdentityProjectionDebt {
  return new SqliteIdentityProjectionDebt({ db })
}

class SqliteIdentityProjectionDebt implements IdentityProjectionDebt {
  private readonly db: Db

  constructor({ db }: { readonly db: Db }) {
    this.db = db
  }

  mark({ now }: { siteId?: string | undefined; now: Date }): void {
    this.db.$client
      .prepare(
        `INSERT INTO identity_projection_debt (singleton_key, debt_through, updated_at)
         VALUES ('default', ?, ?)
         ON CONFLICT (singleton_key) DO UPDATE SET
           debt_through = MAX(COALESCE(debt_through, 0), excluded.debt_through),
           updated_at = excluded.updated_at`,
      )
      .run(now.getTime(), now.getTime())
  }

  clear({ now }: { now: Date }): void {
    this.db.$client
      .prepare(
        `UPDATE identity_projection_debt
         SET debt_through = NULL, updated_at = ?
         WHERE singleton_key = 'default' AND debt_through <= ?`,
      )
      .run(now.getTime(), now.getTime())
  }

  hasPending(): boolean {
    return this.debtThrough() !== null
  }

  isStale(projectedAt: Date): boolean {
    const debtThrough = this.debtThrough()
    return debtThrough !== null && debtThrough > projectedAt.getTime()
  }

  private debtThrough(): number | null {
    const row = this.db.$client
      .prepare(
        `SELECT debt_through AS debtThrough
         FROM identity_projection_debt
         WHERE singleton_key = 'default'`,
      )
      .get() as { readonly debtThrough: number | null } | undefined
    return row?.debtThrough ?? null
  }
}
