import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { encrypt } from '../src/crypto.js';
import { backupDatabase } from './backup.js';
const config = loadConfig();
const data = z.object({ instanceId: z.string(), projectId: z.coerce.number().int().positive(), mode: z.enum(['legacy', 'signed']), secret: z.string().min(32).max(256) }).parse({ instanceId: process.env.HOOK_INSTANCE_ID, projectId: process.env.HOOK_PROJECT_ID, mode: process.env.HOOK_MODE || 'signed', secret: process.env.HOOK_SECRET });
if (!config.instances.some(v => v.id === data.instanceId)) throw new Error('Instance not allowlisted');
if (data.mode === 'signed' && !data.secret.startsWith('whsec_')) throw new Error('Standard Webhooks signing key required');
await backupDatabase();
const db = createPool();
try {
  const result = await db.query<{ id: string }>('INSERT INTO registrations(id,instance_id,project_id,mode,encrypted_secret) VALUES($1,$2,$3,$4,$5) ON CONFLICT(instance_id,project_id) DO UPDATE SET mode=EXCLUDED.mode,encrypted_secret=EXCLUDED.encrypted_secret,active=true RETURNING id', [randomUUID(), data.instanceId, data.projectId, data.mode, encrypt(data.secret, config.encryptionKey)]);
  process.stdout.write(`Registration ID: ${result.rows[0].id}\nConfigure the project webhook at the trusted HTTPS receiver /v1/webhooks/${result.rows[0].id}\n`);
} finally { await db.end(); }
