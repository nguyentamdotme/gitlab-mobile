import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { z } from 'zod';
import type { TrustedInstance } from './config.js';

export function allowedAddress(address: string, allowPrivate: boolean): boolean {
  const value = address.toLowerCase();
  if (value.startsWith('::ffff:')) return allowedAddress(value.slice(7), allowPrivate);
  if (isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    if (a === 0 || a === 127 || a >= 224 || (a === 169 && b === 254)) return false;
    const privateRange = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || a === 198;
    return allowPrivate || !privateRange;
  }
  if (isIP(value) === 6) {
    if (value === '::' || value === '::1' || value.startsWith('ff') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('2001:db8')) return false;
    return value.startsWith('2') || (allowPrivate && /^(fc|fd)/.test(value));
  }
  return false;
}
export type GitLabRead = (instance: TrustedInstance, token: string, path: string) => Promise<unknown>;
export const gitlabRead: GitLabRead = async (instance, token, path) => {
  if (!/^\/(user|projects\/\d+)$/.test(path)) throw new Error('Verification path not allowed');
  const url = new URL(instance.baseUrl + '/api/v4' + path);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(v => !allowedAddress(v.address, instance.allowPrivate))) throw new Error('Egress blocked');
  const address = addresses[0];
  const pinnedLookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, [address]); else callback(null, address.address, address.family);
  };
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', agent: false, lookup: pinnedLookup, timeout: 10_000, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('GitLab verification denied')); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 512 * 1024) { req.destroy(); reject(new Error('Verification body too large')); } else chunks.push(chunk); });
      response.on('error', () => reject(new Error('GitLab response failed')));
      response.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Invalid GitLab response')); } });
    });
    req.on('timeout', () => req.destroy(new Error('Verification timed out')));
    req.on('error', () => reject(new Error('GitLab unreachable')));
    req.end();
  });
};
const userSchema = z.object({ id: z.number().int().positive() });
const projectSchema = z.object({ id: z.number().int().positive() });
export async function verify(read: GitLabRead, instance: TrustedInstance, token: string, expectedUser?: number, project?: number) {
  const user = userSchema.parse(await read(instance, token, '/user'));
  if (expectedUser !== undefined && user.id !== expectedUser) throw new Error('Wrong GitLab account');
  if (project !== undefined && projectSchema.parse(await read(instance, token, `/projects/${project}`)).id !== project) throw new Error('Wrong project');
  return user.id;
}
