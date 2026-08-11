// Mirrors includes/db.php's Database class, but backed by D1 instead of PDO/MySQL.
// D1 uses the same positional `?` placeholder style as the old PDO code, so
// most call sites port over with only syntax changes, not logic changes.

export type Row = Record<string, unknown>;

export class Db {
  constructor(private d1: D1Database) {}

  async fetchAll<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.d1.prepare(sql).bind(...params).all<T>();
    return res.results ?? [];
  }

  async fetchOne<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
    const res = await this.d1.prepare(sql).bind(...params).first<T>();
    return res ?? null;
  }

  async query(sql: string, params: unknown[] = []): Promise<D1Result> {
    return this.d1.prepare(sql).bind(...params).run();
  }

  /** Runs an INSERT and returns the new row's id (mirrors PDO lastInsertId()). */
  async insert(sql: string, params: unknown[] = []): Promise<number> {
    const res = await this.d1.prepare(sql).bind(...params).run();
    return Number(res.meta.last_row_id ?? 0);
  }

  async count(sql: string, params: unknown[] = []): Promise<number> {
    const row = await this.fetchOne<{ cnt: number }>(sql, params);
    if (!row) return 0;
    const val = Object.values(row)[0];
    return Number(val ?? 0);
  }

  /** Exposes the raw D1 prepare/batch API for bulk operations (e.g. upserting
   *  thousands of rows in one round trip) where the wrapper methods above,
   *  which each do their own round trip, would be too slow. */
  prepare(sql: string): D1PreparedStatement {
    return this.d1.prepare(sql);
  }
  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return this.d1.batch(statements);
  }
}

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}
