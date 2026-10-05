import { readFile } from 'node:fs/promises';
import { createPool, transaction } from '../src/db.js';
import { backupDatabase } from './backup.js';
const backup = await backupDatabase();
const db = createPool();
try {
  await transaction(db, async client => {
    await client.query("SELECT pg_advisory_xact_lock(83628141)");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const name = '001-notification-state.sql';
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
    if (!applied.rowCount) { await client.query(await readFile(new URL('../db/migrations/' + name, import.meta.url), 'utf8')); await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]); }
  });
  process.stdout.write(`Migration completed; backup: ${backup}\n`);
} finally { await db.end(); }
