import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { createServer } from 'node:net';
const name = `gitlab-mobile-integration-${process.pid}`;
const directory = await mkdtemp(join(tmpdir(), name));
let started = false;
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  await new Promise((resolve, reject) => { const probe = createServer(); probe.once('error', reject); probe.listen(55432, '127.0.0.1', () => probe.close(resolve)); });
  docker(['run', '--rm', '-d', '--name', name, '-p', '127.0.0.1:55432:5432', '-e', 'POSTGRES_PASSWORD=disposable-test-password', 'postgres:17-alpine']); started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) { try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break; } catch { await setTimeout(500); } }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready');
  await writeFile(join(directory, 'before-migration.sql'), docker(['exec', name, 'pg_dump', '-U', 'postgres', '-d', 'postgres']), { mode: 0o600 });
  const child = spawn('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest-integration.config.ts'], { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: 'postgres://postgres:disposable-test-password@127.0.0.1:55432/postgres', TEST_DATABASE_BACKUP: join(directory, 'before-migration.sql') } });
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
} catch (error) {
  process.stderr.write('Notification integration failed; no existing database was changed.\n');
  const detail = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : error instanceof Error ? error.message : 'Unknown integration error';
  process.stderr.write(detail.slice(0, 1200) + '\n'); process.exitCode = 1;
}
finally { if (started) docker(['stop', '-t', '5', name]); await rm(directory, { recursive: true, force: true }); }
