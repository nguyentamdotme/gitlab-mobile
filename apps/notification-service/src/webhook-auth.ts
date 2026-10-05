import { createHmac } from 'node:crypto';
import { constantEquals } from './crypto.js';
type Headers = Record<string, string | string[] | undefined>;
const header = (headers: Headers, name: string) => typeof headers[name] === 'string' ? headers[name] as string : '';
export function verifyWebhook(mode: 'legacy' | 'signed', secret: string, headers: Headers, body: Buffer, now = Date.now()): boolean {
  if (mode === 'legacy') return !!header(headers, 'x-gitlab-token') && constantEquals(secret, header(headers, 'x-gitlab-token'));
  const id = header(headers, 'webhook-id'); const timestamp = header(headers, 'webhook-timestamp'); const signatures = header(headers, 'webhook-signature');
  if (!id || id.length > 200 || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || signatures.length > 2000 || !secret.startsWith('whsec_')) return false;
  const key = Buffer.from(secret.slice(6), 'base64');
  if (key.length < 16) return false;
  const expected = 'v1,' + createHmac('sha256', key).update(`${id}.${timestamp}.`).update(body).digest('base64');
  return signatures.split(' ').some(signature => constantEquals(expected, signature));
}
