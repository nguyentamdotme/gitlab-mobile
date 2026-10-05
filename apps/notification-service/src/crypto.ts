import { randomBytes, createHash, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
export const opaqueToken = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const constantEquals = (left: string, right: string) => timingSafeEqual(Buffer.from(hash(left)), Buffer.from(hash(right)));
export function encrypt(secret: string, key: Buffer): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function decrypt(value: string, key: Buffer): string {
  const raw = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
