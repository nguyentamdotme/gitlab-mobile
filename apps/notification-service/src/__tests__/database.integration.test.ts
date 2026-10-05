import { beforeAll, afterAll, test, expect, vi } from 'vitest';
import { Pool } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from '../server.js';
import { encrypt } from '../crypto.js';
import { workOnce, type PushGateway } from '../push-worker.js';
import type { FastifyInstance } from 'fastify';
let db: Pool; let server: FastifyInstance; let permission = true;
const registration = randomUUID(); const key = randomBytes(32); const deviceId = randomUUID();
let auth: { accessToken: string; refreshToken: string; accountRef: string; cleanupToken: string };
let subscriptionId: string; let eventId: string;
const gateway: PushGateway = { send: vi.fn(async () => ({ id: 'synthetic-ticket' })), receipt: vi.fn(async () => ({ status: 'ok' as const })) };
const inject = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object, token = auth?.accessToken) => server.inject({ method, url, payload, headers: token ? { authorization: 'Bearer ' + token } : {} });
const webhookPayload = (id = 40) => ({ object_kind: 'pipeline', project: { id: 4, name: 'private-project' }, object_attributes: { id, status: 'failed', variables: [{ key: 'PASSWORD', value: 'synthetic-secret' }], updated_at: '2026-10-04T10:00:00Z' } });
const webhook = (delivery: string, id = 40, secret = 'synthetic-webhook-secret-only-for-tests') => server.inject({ method: 'POST', url: '/v1/webhooks/' + registration, payload: webhookPayload(id), headers: { 'x-gitlab-token': secret, 'x-gitlab-webhook-uuid': delivery } });
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL || !process.env.TEST_DATABASE_BACKUP) throw new Error('Use test:integration; an isolated DB and pre-migration backup are required');
  expect((await stat(process.env.TEST_DATABASE_BACKUP)).size).toBeGreaterThan(0);
  db = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await db.query(await readFile(new URL('../../db/migrations/001-notification-state.sql', import.meta.url), 'utf8'));
  await db.query('INSERT INTO registrations(id,instance_id,project_id,mode,encrypted_secret) VALUES($1,$2,$3,$4,$5)', [registration, 'gitlab', 4, 'legacy', encrypt('synthetic-webhook-secret-only-for-tests', key)]);
  server = await createServer(db, { instances: [{ id: 'gitlab', baseUrl: 'https://gitlab.example', allowPrivate: false }], encryptionKey: key, host: '127.0.0.1', port: 3001 }, async (_instance, token, path) => {
    if (path !== '/user' && !permission) throw new Error('permission revoked');
    if (path === '/user') return { id: token === 'second-user-token' ? 20 : 12 };
    return { id: Number(path.split('/').pop()) };
  });
});
afterAll(async () => { await server?.close(); await db?.end(); });
test('unknown instances rejected and service session tied to server verified user', async () => {
  expect((await inject('POST', '/v1/session', { instanceId: 'attacker', gitlabToken: 'synthetic-gitlab-token', deviceId }, '')).statusCode).toBe(400);
  const result = await inject('POST', '/v1/session', { instanceId: 'gitlab', gitlabToken: 'synthetic-gitlab-token', deviceId }, ''); expect(result.statusCode).toBe(200); auth = result.json();
  const rows = await db.query('SELECT * FROM service_sessions'); expect(rows.rows[0].user_id).toBe('12'); expect(JSON.stringify(rows.rows)).not.toContain('synthetic-gitlab-token'); expect(JSON.stringify(rows.rows)).not.toContain(auth.accessToken);
});
test('device registration rejects another device and registers own push address', async () => {
  expect((await inject('PUT', '/v1/devices/' + randomUUID(), { pushToken: 'ExpoPushToken[synthetic]' })).statusCode).toBe(403);
  expect((await inject('PUT', '/v1/devices/' + deviceId, { pushToken: 'ExpoPushToken[synthetic]' })).statusCode).toBe(204);
});
test('subscription creation reverifies current user and exact project', async () => {
  const preferences = { events: ['pipelines'], quietHours: null };
  expect((await inject('POST', '/v1/subscriptions', { projectId: 4, gitlabToken: 'second-user-token', preferences })).statusCode).toBe(403);
  expect((await inject('POST', '/v1/subscriptions', { projectId: 5, gitlabToken: 'synthetic-gitlab-token', preferences })).statusCode).toBe(409);
  const result = await inject('POST', '/v1/subscriptions', { projectId: 4, gitlabToken: 'synthetic-gitlab-token', preferences }); expect(result.statusCode).toBe(200); subscriptionId = result.json().id;
});
test('forged and wrong-project webhooks reject without storing events', async () => {
  expect((await webhook('forged', 40, 'wrong')).statusCode).toBe(401);
  const wrong = await server.inject({ method: 'POST', url: '/v1/webhooks/' + registration, payload: { ...webhookPayload(), project: { id: 5 } }, headers: { 'x-gitlab-token': 'synthetic-webhook-secret-only-for-tests' } }); expect(wrong.statusCode).toBe(400);
  expect((await db.query('SELECT count(*) FROM events')).rows[0].count).toBe('0');
});
test('duplicate event creates one transactionally durable outbox row', async () => {
  expect((await webhook('delivery-1')).statusCode).toBe(202); expect((await webhook('delivery-1')).statusCode).toBe(202);
  const events = await db.query('SELECT * FROM events'); expect(events.rowCount).toBe(1); eventId = events.rows[0].id;
  expect(JSON.stringify(events.rows)).not.toMatch(/private-project|synthetic-secret|variables|failed/); expect((await db.query('SELECT count(*) FROM outbox')).rows[0].count).toBe('1');
});
test('event resolution requires current GitLab permission and correct account', async () => {
  const resolve = (token: string) => server.inject({ method: 'GET', url: '/v1/events/' + eventId, headers: { authorization: 'Bearer ' + auth.accessToken, 'x-gitlab-access-token': token } });
  expect((await resolve('second-user-token')).statusCode).toBe(403);
  permission = false; expect((await resolve('synthetic-gitlab-token')).statusCode).toBe(403);
  permission = true; const result = await resolve('synthetic-gitlab-token'); expect(result.statusCode).toBe(200); expect(result.json()).toEqual({ instance: 'https://gitlab.example', userId: 12, projectId: 4, resource: 'pipelines', id: 40 });
});
test('worker sends only opaque generic data and processes actual receipt state', async () => {
  await db.query('UPDATE outbox SET next_attempt_at=now()'); await workOnce(db, gateway); expect(gateway.send).toHaveBeenCalledWith('ExpoPushToken[synthetic]', { eventId, accountRef: auth.accountRef });
  await db.query('UPDATE outbox SET next_attempt_at=now()'); await workOnce(db, gateway); expect(gateway.receipt).toHaveBeenCalledWith('synthetic-ticket'); expect((await db.query('SELECT state FROM outbox')).rows[0].state).toBe('done');
});
test('enqueue before lease expiry cannot deliver after expiry', async () => {
  await webhook('delivery-2', 41); await db.query('UPDATE subscriptions SET lease_until=now()-interval \'1 second\' WHERE id=$1', [subscriptionId]); await db.query('UPDATE outbox SET next_attempt_at=now() WHERE state=\'pending\'');
  const count = vi.mocked(gateway.send).mock.calls.length; await workOnce(db, gateway); expect(gateway.send).toHaveBeenCalledTimes(count); expect((await db.query("SELECT state FROM outbox ORDER BY id DESC LIMIT 1")).rows[0].state).toBe('dropped');
});
test('refresh rotates once, old refresh cannot be replayed, lease is not renewed', async () => {
  const first = await inject('POST', '/v1/session/refresh', { refreshToken: auth.refreshToken, deviceId }); expect(first.statusCode).toBe(200);
  expect((await inject('POST', '/v1/session/refresh', { refreshToken: auth.refreshToken, deviceId })).statusCode).toBe(401); auth = { ...auth, ...first.json() };
  expect((await db.query('SELECT lease_until<now() AS expired FROM subscriptions WHERE id=$1', [subscriptionId])).rows[0].expired).toBe(true);
});
test('cleanup-only handle revokes queued delivery and never grants read access', async () => {
  expect((await inject('GET', '/v1/subscriptions', undefined, auth.cleanupToken)).statusCode).toBe(401);
  expect((await server.inject({ method: 'DELETE', url: '/v1/session/cleanup', headers: { 'x-cleanup-token': auth.cleanupToken } })).statusCode).toBe(204);
  expect((await inject('GET', '/v1/subscriptions')).statusCode).toBe(401);
});
