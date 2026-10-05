import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function backupDatabase(): Promise<string> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const directory = resolve(process.env.BACKUP_DIRECTORY || 'backups');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = resolve(directory, `notification-${Date.now()}.dump`);
  const output = createWriteStream(file, { mode: 0o600, flags: 'wx' });
  await new Promise<void>((done, reject) => {
    let succeeded = false;
    const child = spawn('pg_dump', ['--format=custom'], { env: { ...process.env, PGDATABASE: process.env.DATABASE_URL }, stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.pipe(output); child.on('error', reject); output.on('error', reject);
    child.on('close', code => { if (code !== 0) reject(new Error('Database backup failed; no mutation was applied')); else { succeeded = true; if (output.writableFinished) done(); } });
    output.on('finish', () => { if (succeeded) done(); });
  });
  return file;
}
