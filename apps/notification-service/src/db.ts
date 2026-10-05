import { Pool, PoolClient } from 'pg';
export type Db = Pick<Pool, 'query' | 'connect'>;
export function createPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
}
export async function transaction<T>(db: Db, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
