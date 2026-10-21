import type { Pool, PoolClient } from "pg";

export type Exec = (sql: string, params?: unknown[]) => Promise<any[]>;

const g = globalThis as unknown as { __boostPool?: Pool; __boostExec?: Exec };

/** Tests can replace the database with an in-memory one. */
export function setExecutor(e: Exec | undefined) {
  g.__boostExec = e;
}

async function pool(): Promise<Pool> {
  if (!g.__boostPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Add it in Vercel > Settings > Environment Variables.");
    const pg = await import("pg");
    const types = (pg as any).types ?? (pg as any).default?.types;
    const PoolCtor = (pg as any).Pool ?? (pg as any).default?.Pool;
    // numeric and bigint arrive as strings by default, dates as Date objects: return plain numbers and yyyy-mm-dd strings
    types.setTypeParser(1700, (v: string) => parseFloat(v));
    types.setTypeParser(20, (v: string) => parseInt(v, 10));
    types.setTypeParser(1082, (v: string) => v);
    g.__boostPool = new PoolCtor({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }) as Pool;
  }
  return g.__boostPool;
}

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (g.__boostExec) return (await g.__boostExec(sql, params)) as T[];
  const res = await (await pool()).query(sql, params as any[]);
  return res.rows as T[];
}

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await (await pool()).connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    c.release();
  }
}
