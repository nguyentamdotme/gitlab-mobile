import { z } from 'zod';
import { subscriptionPreferencesSchema } from '@gitlab-mobile/contracts';
import { Db, transaction } from './db.js';
export interface Delivery {
  id: string; event_id: string; subscription_id: string; session_id: string; push_token: string;
  resource: string; project_id: string; preferences: unknown; state: string; attempts: number; ticket_id: string | null;
}
export interface PushGateway { send(token: string, data: { eventId: string; accountRef: string }): Promise<{ id?: string; error?: string }>; receipt(id: string): Promise<{ status: 'ok' | 'error' | 'pending'; error?: string }> }
export class ExpoGateway implements PushGateway {
  constructor(private accessToken?: string) {}
  private async post(path: string, body: unknown) {
    const response = await fetch('https://exp.host/--/api/v2/push/' + path, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { 'Content-Type': 'application/json', ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('Expo unavailable');
    return response.json() as Promise<unknown>;
  }
  async send(token: string, data: { eventId: string; accountRef: string }) {
    const result = z.object({ data: z.object({ status: z.enum(['ok', 'error']), id: z.string().optional(), details: z.object({ error: z.string().optional() }).optional() }) }).parse(await this.post('send', { to: token, title: 'GitLab Mobile', body: 'Có cập nhật cần kiểm tra', data, ttl: 3600, sound: 'default' }));
    return { id: result.data.status === 'ok' ? result.data.id : undefined, error: result.data.details?.error };
  }
  async receipt(id: string) {
    const result = z.object({ data: z.record(z.string(), z.object({ status: z.enum(['ok', 'error']), details: z.object({ error: z.string().optional() }).optional() })) }).parse(await this.post('getReceipts', { ids: [id] }));
    const value = result.data[id]; return value ? { status: value.status, error: value.details?.error } : { status: 'pending' as const };
  }
}
export function inQuietHours(quiet: { start: number; end: number } | null, now: Date): boolean {
  if (!quiet || quiet.start === quiet.end) return false;
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return quiet.start < quiet.end ? minute >= quiet.start && minute < quiet.end : minute >= quiet.start || minute < quiet.end;
}
export async function workOnce(db: Db, gateway: PushGateway, now = new Date()): Promise<boolean> {
  const claimed = await transaction(db, async client => {
    const result = await client.query<{ id: string }>(`SELECT id FROM outbox WHERE state IN ('pending','receipt') AND next_attempt_at<=now() AND (locked_until IS NULL OR locked_until<now()) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (!result.rows[0]) return undefined;
    await client.query("UPDATE outbox SET locked_until=now()+interval '60 seconds' WHERE id=$1", [result.rows[0].id]); return result.rows[0].id;
  });
  if (!claimed) return false;
  try {
    const result = await db.query<Delivery>(`SELECT o.id,o.event_id,o.subscription_id,o.state,o.attempts,o.ticket_id,s.session_id,s.project_id,s.preferences,d.push_token,e.resource FROM outbox o JOIN events e ON e.id=o.event_id JOIN registrations r ON r.id=e.registration_id JOIN subscriptions s ON s.id=o.subscription_id JOIN service_sessions a ON a.id=s.session_id JOIN devices d ON d.session_id=a.id WHERE o.id=$1 AND r.active AND s.active AND a.active AND d.active AND s.lease_until>now() AND a.expires_at>now() AND e.expires_at>now() AND r.instance_id=a.instance_id AND r.project_id=s.project_id`, [claimed]);
    const row = result.rows[0];
    if (!row) { await db.query("UPDATE outbox SET state='dropped',locked_until=NULL WHERE id=$1", [claimed]); return true; }
    const preferences = subscriptionPreferencesSchema.parse(row.preferences);
    if (!preferences.events.includes(row.resource as typeof preferences.events[number])) { await db.query("UPDATE outbox SET state='dropped',locked_until=NULL WHERE id=$1", [claimed]); return true; }
    if (inQuietHours(preferences.quietHours, now)) { await db.query("UPDATE outbox SET next_attempt_at=now()+interval '5 minutes',locked_until=NULL WHERE id=$1", [claimed]); return true; }
    if (row.state === 'receipt' && row.ticket_id) {
      const receipt = await gateway.receipt(row.ticket_id);
      if (receipt.error === 'DeviceNotRegistered') await db.query('UPDATE devices SET active=false WHERE session_id=$1', [row.session_id]);
      if (receipt.status === 'pending') {
        await db.query("UPDATE outbox SET attempts=attempts+1,state=CASE WHEN attempts>=7 THEN 'dead' ELSE 'receipt' END,next_attempt_at=now()+interval '5 minutes',locked_until=NULL WHERE id=$1", [claimed]);
      } else await db.query("UPDATE outbox SET state=$2,locked_until=NULL WHERE id=$1", [claimed, receipt.status === 'ok' ? 'done' : 'dead']);
      return true;
    }
    const newer = await db.query(`SELECT 1 FROM outbox o JOIN subscriptions s ON s.id=o.subscription_id JOIN events e ON e.id=o.event_id WHERE s.session_id=$1 AND s.project_id=$2 AND o.id>$3 AND o.state='pending' AND s.preferences->'events' ? e.resource LIMIT 1`, [row.session_id, row.project_id, row.id]);
    if (newer.rowCount) { await db.query("UPDATE outbox SET state='dropped',locked_until=NULL WHERE id=$1", [claimed]); return true; }
    const ticket = await gateway.send(row.push_token, { eventId: row.event_id, accountRef: row.session_id });
    if (ticket.error === 'DeviceNotRegistered') { await db.query('UPDATE devices SET active=false WHERE session_id=$1', [row.session_id]); await db.query("UPDATE outbox SET state='dropped',locked_until=NULL WHERE id=$1", [claimed]); }
    else if (ticket.id) await db.query("UPDATE outbox SET state='receipt',ticket_id=$2,next_attempt_at=now()+interval '15 minutes',attempts=0,locked_until=NULL WHERE id=$1", [claimed, ticket.id]);
    else throw new Error('Push ticket rejected');
  } catch {
    await db.query("UPDATE outbox SET attempts=attempts+1,state=CASE WHEN attempts>=7 THEN 'dead' ELSE state END,next_attempt_at=now()+LEAST(3600,power(2,attempts)*30)*interval '1 second',locked_until=NULL WHERE id=$1", [claimed]);
  }
  return true;
}
