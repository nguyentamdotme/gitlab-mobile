import { test, expect } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { allowedAddress, verify } from '../gitlab-verification.js';
import { verifyWebhook } from '../webhook-auth.js';
import { encrypt, decrypt } from '../crypto.js';
import { normalizeEvent } from '../event-normalizer.js';
import { inQuietHours } from '../push-worker.js';
test.each(['127.0.0.1', '169.254.169.254', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fe80::1'])('blocks local/metadata egress even for private allowlist %s', ip => expect(allowedAddress(ip, true)).toBe(false));
test.each(['10.0.0.1', '192.168.1.2', '172.16.0.1', '100.64.0.1', 'fd00::1'])('private addresses require explicit registry policy %s', ip => { expect(allowedAddress(ip, false)).toBe(false); expect(allowedAddress(ip, true)).toBe(true); });
test.each(['8.8.8.8', '2606:4700:4700::1111'])('allows public egress %s', ip => expect(allowedAddress(ip, false)).toBe(true));
test('permission verification binds user and project to GitLab responses', async () => {
  const instance = { id: 'gitlab', baseUrl: 'https://gitlab.example', allowPrivate: false };
  await expect(verify(async () => ({ id: 20 }), instance, 'synthetic', 12)).rejects.toThrow('Wrong GitLab account');
  await expect(verify(async (_instance, _token, path) => ({ id: path === '/user' ? 12 : 5 }), instance, 'synthetic', 12, 4)).rejects.toThrow('Wrong project');
});
test('legacy token requires exact match', () => { expect(verifyWebhook('legacy', 'synthetic-key', { 'x-gitlab-token': 'synthetic-key' }, Buffer.from('{}'))).toBe(true); expect(verifyWebhook('legacy', 'synthetic-key', { 'x-gitlab-token': 'forged' }, Buffer.from('{}'))).toBe(false); });
test('Standard Webhooks raw-body HMAC rejects tampering and expired timestamp', () => {
  const key = randomBytes(32); const secret = 'whsec_' + key.toString('base64'); const timestamp = String(Math.floor(Date.now() / 1000)); const body = Buffer.from('{ "object_kind": "pipeline" }');
  const signature = 'v1,' + createHmac('sha256', key).update(`delivery-id.${timestamp}.`).update(body).digest('base64');
  const headers = { 'webhook-id': 'delivery-id', 'webhook-timestamp': timestamp, 'webhook-signature': 'v1,forged ' + signature };
  expect(verifyWebhook('signed', secret, headers, body)).toBe(true);
  expect(verifyWebhook('signed', secret, headers, Buffer.from('{}'))).toBe(false);
  expect(verifyWebhook('signed', secret, headers, body, Date.now() + 301_000)).toBe(false);
  expect(verifyWebhook('signed', secret, { 'x-gitlab-token': secret }, body)).toBe(false);
});
test('webhook keys encrypted with authenticated encryption at rest', () => { const key = randomBytes(32); const value = encrypt('synthetic-secret', key); expect(value).not.toContain('synthetic-secret'); expect(decrypt(value, key)).toBe('synthetic-secret'); expect(() => decrypt(value, randomBytes(32))).toThrow(); });
test('normalization drops all sensitive content and verifies project', () => {
  const payload = { object_kind: 'pipeline', project: { id: 4, name: 'private-name' }, object_attributes: { id: 40, status: 'failed', variables: [{ key: 'SYNTHETIC', value: 'sensitive-value' }] } };
  const event = normalizeEvent(payload, 4, 'delivery-id'); expect(event).toMatchObject({ resource: 'pipelines', id: 40 }); expect(JSON.stringify(event)).not.toMatch(/private-name|sensitive-value|failed/);
  expect(() => normalizeEvent(payload, 5)).toThrow('Project mismatch'); expect(normalizeEvent(payload, 4, 'delivery-id').dedupHash).toBe(event.dedupHash);
});
test('deployment events use actual deployment_id from GitLab, not invented environment_id', () => expect(normalizeEvent({ object_kind: 'deployment', project: { id: 4 }, deployment_id: 60, environment: 'staging' }, 4)).toMatchObject({ resource: 'deployments', id: 60 }));
test('MR/note routes use project IID', () => expect(normalizeEvent({ object_kind: 'note', project: { id: 4 }, object_attributes: { id: 900, noteable_type: 'MergeRequest' }, merge_request: { id: 1000, iid: 8 } }, 4)).toMatchObject({ resource: 'merge-requests', id: 8 }));
test('quiet hours handle midnight and disabled range', () => { expect(inQuietHours({ start: 1320, end: 420 }, new Date('2026-10-04T23:00:00Z'))).toBe(true); expect(inQuietHours({ start: 1320, end: 420 }, new Date('2026-10-04T12:00:00Z'))).toBe(false); expect(inQuietHours({ start: 0, end: 0 }, new Date())).toBe(false); });
