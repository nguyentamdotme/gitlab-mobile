import { z } from 'zod';
const instanceSchema = z.object({ id: z.string().min(1), baseUrl: z.string().url(), allowPrivate: z.boolean().default(false) }).transform(instance => {
  if (/%2e|%2f|%5c/i.test(instance.baseUrl)) throw new Error('Invalid trusted instance path');
  const url = new URL(instance.baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /%2e|%2f|%5c/i.test(url.pathname)) throw new Error('Invalid trusted instance');
  return { ...instance, baseUrl: url.toString().replace(/\/$/, '') };
});
export type TrustedInstance = z.infer<typeof instanceSchema>;
export interface Config { instances: TrustedInstance[]; encryptionKey: Buffer; port: number; host: string; expoAccessToken?: string }
export function loadConfig(): Config {
  const key = Buffer.from(process.env.WEBHOOK_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('WEBHOOK_ENCRYPTION_KEY must contain 32 bytes, base64 encoded');
  const instances = z.array(instanceSchema).min(1).parse(JSON.parse(process.env.TRUSTED_INSTANCES || '[]'));
  if (new Set(instances.map(v => v.id)).size !== instances.length) throw new Error('Duplicate instance IDs');
  return { instances, encryptionKey: key, port: Number(process.env.PORT || '3001'), host: process.env.HOST || '127.0.0.1', expoAccessToken: process.env.EXPO_ACCESS_TOKEN };
}
