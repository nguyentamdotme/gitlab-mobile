import Fastify, { type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { subscriptionPreferencesSchema } from '@gitlab-mobile/contracts';
import type { Config } from './config.js';
import { hash, opaqueToken, decrypt } from './crypto.js';
import { Db, transaction } from './db.js';
import { GitLabRead, gitlabRead, verify } from './gitlab-verification.js';
import { verifyWebhook } from './webhook-auth.js';
import { normalizeEvent } from './event-normalizer.js';

interface ServiceRow { id: string; instance_id: string; user_id: string; device_id: string; expires_at: Date }
class ServiceError extends Error { constructor(public statusCode: number) { super('Request rejected'); } }
const uuid = z.string().uuid(); const id = z.number().int().positive(); const gitlabToken = z.string().min(1).max(4096);
const authHeader = (request: FastifyRequest) => request.headers.authorization?.replace(/^Bearer /, '') || '';
export async function createServer(db: Db, config: Config, read: GitLabRead = gitlabRead) {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024, requestTimeout: 15_000, trustProxy: false });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    try { if (request.url.startsWith('/v1/webhooks/')) done(null, body); else done(null, JSON.parse((body as Buffer).toString('utf8'))); }
    catch { done(new ServiceError(400)); }
  });
  app.setErrorHandler((error, _request, reply) => {
    const code = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 503;
    const status = error instanceof ServiceError ? error.statusCode : error instanceof z.ZodError ? 400 : code < 500 ? code : 503;
    void reply.code(status).send({ error: status === 503 ? 'Service temporarily unavailable' : 'Request rejected' });
  });
  const instance = (instanceId: string) => { const value = config.instances.find(v => v.id === instanceId); if (!value) throw new ServiceError(400); return value; };
  const authenticate = async (request: FastifyRequest): Promise<ServiceRow> => {
    const token = authHeader(request); if (!token || token.length > 512) throw new ServiceError(401);
    const result = await db.query<ServiceRow>('SELECT id,instance_id,user_id,device_id,expires_at FROM service_sessions WHERE access_hash=$1 AND active AND access_expires_at>now() AND expires_at>now()', [hash(token)]);
    if (!result.rows[0]) throw new ServiceError(401); return result.rows[0];
  };
  const reverify = async (session: ServiceRow, token: string, projectId?: number) => {
    try { return await verify(read, instance(session.instance_id), token, Number(session.user_id), projectId); }
    catch { throw new ServiceError(403); }
  };
  app.get('/health', () => ({ status: 'ok' }));
  app.get('/ready', async () => { await db.query('SELECT 1'); return { status: 'ready' }; });
  app.get('/v1/instances', () => ({ instances: config.instances.map(v => ({ id: v.id, baseUrl: v.baseUrl })) }));
  app.post('/v1/session', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async request => {
    const data = z.object({ instanceId: z.string(), gitlabToken, deviceId: uuid }).parse(request.body);
    const trustedInstance = instance(data.instanceId);
    let userId: number;
    try { userId = await verify(read, trustedInstance, data.gitlabToken); } catch { throw new ServiceError(403); }
    const sessionId = randomUUID(); const accessToken = opaqueToken(); const refreshToken = opaqueToken(); const cleanupToken = opaqueToken(); const expiresAt = Date.now() + 15 * 60_000;
    await transaction(db, async client => {
      await client.query('UPDATE service_sessions SET active=false WHERE instance_id=$1 AND user_id=$2 AND device_id=$3', [data.instanceId, userId, data.deviceId]);
      await client.query('INSERT INTO service_sessions(id,instance_id,user_id,device_id,access_hash,refresh_hash,cleanup_hash,access_expires_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval \'30 days\')', [sessionId, data.instanceId, userId, data.deviceId, hash(accessToken), hash(refreshToken), hash(cleanupToken), new Date(expiresAt)]);
    });
    return { accessToken, refreshToken, cleanupToken, expiresAt, accountRef: sessionId };
  });
  app.post('/v1/session/refresh', async request => {
    const data = z.object({ refreshToken: z.string().max(512), deviceId: uuid }).parse(request.body);
    return transaction(db, async client => {
      const result = await client.query<ServiceRow>('SELECT id,instance_id,user_id,device_id,expires_at FROM service_sessions WHERE refresh_hash=$1 AND device_id=$2 AND active AND expires_at>now() FOR UPDATE', [hash(data.refreshToken), data.deviceId]);
      const row = result.rows[0]; if (!row) throw new ServiceError(401);
      const accessToken = opaqueToken(); const refreshToken = opaqueToken(); const expiresAt = Math.min(Date.now() + 15 * 60_000, row.expires_at.getTime());
      await client.query('UPDATE service_sessions SET access_hash=$1,refresh_hash=$2,access_expires_at=$3 WHERE id=$4', [hash(accessToken), hash(refreshToken), new Date(expiresAt), row.id]);
      return { accessToken, refreshToken, expiresAt, accountRef: row.id };
    });
  });
  app.delete('/v1/session', async (request, reply) => {
    const row = await authenticate(request);
    await transaction(db, async client => {
      await client.query('UPDATE service_sessions SET active=false WHERE id=$1', [row.id]);
      await client.query('UPDATE subscriptions SET active=false WHERE session_id=$1', [row.id]);
      await client.query('UPDATE devices SET active=false WHERE session_id=$1', [row.id]);
    });
    return reply.code(204).send();
  });
  app.delete('/v1/session/cleanup', async (request, reply) => {
    const token = z.string().min(1).max(512).parse(request.headers['x-cleanup-token']);
    await db.query('UPDATE service_sessions SET active=false WHERE cleanup_hash=$1', [hash(token)]);
    return reply.code(204).send();
  });
  app.put('/v1/devices/:deviceId', async (request, reply) => {
    const row = await authenticate(request); const params = z.object({ deviceId: uuid }).parse(request.params);
    const data = z.object({ pushToken: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/).max(256) }).parse(request.body);
    if (params.deviceId !== row.device_id) throw new ServiceError(403);
    await db.query('INSERT INTO devices(session_id,push_token,active) VALUES($1,$2,true) ON CONFLICT(session_id) DO UPDATE SET push_token=EXCLUDED.push_token,active=true', [row.id, data.pushToken]);
    return reply.code(204).send();
  });
  app.get('/v1/subscriptions', async request => {
    const row = await authenticate(request);
    const result = await db.query('SELECT id,project_id,lease_until,preferences,active FROM subscriptions WHERE session_id=$1 AND active', [row.id]);
    return { subscriptions: result.rows };
  });
  app.post('/v1/subscriptions', async request => {
    const row = await authenticate(request); const data = z.object({ projectId: id, gitlabToken, preferences: subscriptionPreferencesSchema }).parse(request.body);
    await reverify(row, data.gitlabToken, data.projectId);
    const registration = await db.query('SELECT id FROM registrations WHERE instance_id=$1 AND project_id=$2 AND active', [row.instance_id, data.projectId]);
    if (!registration.rowCount) throw new ServiceError(409);
    const result = await db.query('INSERT INTO subscriptions(id,session_id,project_id,lease_until,preferences) VALUES($1,$2,$3,now()+interval \'24 hours\',$4) ON CONFLICT(session_id,project_id) DO UPDATE SET lease_until=EXCLUDED.lease_until,preferences=EXCLUDED.preferences,active=true RETURNING id,lease_until', [randomUUID(), row.id, data.projectId, JSON.stringify(data.preferences)]);
    return result.rows[0];
  });
  app.post('/v1/subscriptions/:id/renew', async request => {
    const row = await authenticate(request); const params = z.object({ id: uuid }).parse(request.params); const data = z.object({ gitlabToken }).parse(request.body);
    const result = await db.query<{ project_id: string }>('SELECT project_id FROM subscriptions WHERE id=$1 AND session_id=$2 AND active', [params.id, row.id]);
    if (!result.rows[0]) throw new ServiceError(404);
    await reverify(row, data.gitlabToken, Number(result.rows[0].project_id));
    const renewed = await db.query('UPDATE subscriptions SET lease_until=now()+interval \'24 hours\' WHERE id=$1 AND session_id=$2 AND active RETURNING id,lease_until', [params.id, row.id]);
    return renewed.rows[0];
  });
  app.delete('/v1/subscriptions/:id', async (request, reply) => {
    const row = await authenticate(request); const params = z.object({ id: uuid }).parse(request.params);
    await db.query('UPDATE subscriptions SET active=false WHERE id=$1 AND session_id=$2', [params.id, row.id]);
    return reply.code(204).send();
  });
  app.delete('/v1/data', async (request, reply) => {
    const row = await authenticate(request); await db.query('DELETE FROM service_sessions WHERE id=$1', [row.id]); return reply.code(204).send();
  });
  app.get('/v1/events/:id', async request => {
    const row = await authenticate(request); const params = z.object({ id: uuid }).parse(request.params);
    const token = gitlabToken.parse(request.headers['x-gitlab-access-token']);
    const result = await db.query<{ project_id: string; resource: string; resource_id: string }>(`SELECT r.project_id,e.resource,e.resource_id FROM events e JOIN registrations r ON r.id=e.registration_id JOIN subscriptions s ON s.project_id=r.project_id AND s.session_id=$2 WHERE e.id=$1 AND e.expires_at>now() AND r.active AND r.instance_id=$3 AND s.active AND s.lease_until>now()`, [params.id, row.id, row.instance_id]);
    const event = result.rows[0]; if (!event) throw new ServiceError(404);
    await reverify(row, token, Number(event.project_id));
    return { instance: instance(row.instance_id).baseUrl, userId: Number(row.user_id), projectId: Number(event.project_id), resource: event.resource, id: Number(event.resource_id) };
  });
  app.post('/v1/webhooks/:id', async (request, reply) => {
    const params = z.object({ id: uuid }).parse(request.params);
    const result = await db.query<{ id: string; instance_id: string; project_id: string; mode: 'legacy' | 'signed'; encrypted_secret: string }>('SELECT id,instance_id,project_id,mode,encrypted_secret FROM registrations WHERE id=$1 AND active', [params.id]);
    const registration = result.rows[0]; if (!registration) throw new ServiceError(404);
    const raw = request.body;
    if (!Buffer.isBuffer(raw) || !verifyWebhook(registration.mode, decrypt(registration.encrypted_secret, config.encryptionKey), request.headers, raw)) throw new ServiceError(401);
    let event: ReturnType<typeof normalizeEvent>;
    try {
      const delivery = request.headers['webhook-id'] || request.headers['x-gitlab-webhook-uuid'] || request.headers['idempotency-key'];
      event = normalizeEvent(JSON.parse(raw.toString('utf8')), Number(registration.project_id), typeof delivery === 'string' ? delivery : undefined);
    } catch { throw new ServiceError(400); }
    await transaction(db, async client => {
      const inserted = await client.query<{ id: string }>('INSERT INTO events(id,registration_id,resource,resource_id,dedup_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedup_hash) DO NOTHING RETURNING id', [randomUUID(), registration.id, event.resource, event.id, hash(`${registration.id}|${event.dedupHash}`)]);
      if (!inserted.rows[0]) return;
      await client.query(`INSERT INTO outbox(event_id,subscription_id,next_attempt_at) SELECT $1,s.id,now()+interval '30 seconds' FROM subscriptions s JOIN service_sessions a ON a.id=s.session_id JOIN devices d ON d.session_id=a.id WHERE a.instance_id=$2 AND s.project_id=$3 AND s.active AND s.lease_until>now() AND a.active AND a.expires_at>now() AND d.active`, [inserted.rows[0].id, registration.instance_id, registration.project_id]);
    });
    return reply.code(202).send({ accepted: true });
  });
  return app;
}
