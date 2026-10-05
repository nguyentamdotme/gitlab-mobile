import { setTimeout } from 'node:timers/promises';
import { createPool } from './db.js';
import { loadConfig } from './config.js';
import { ExpoGateway, workOnce } from './push-worker.js';
const db = createPool(); const config = loadConfig(); const gateway = new ExpoGateway(config.expoAccessToken);
let running = true;
process.once('SIGINT', () => { running = false; }); process.once('SIGTERM', () => { running = false; });
try {
  while (running) {
    await workOnce(db, gateway);
    await db.query('DELETE FROM events WHERE expires_at<now()');
    await db.query("DELETE FROM service_sessions WHERE expires_at<now() OR (NOT active AND expires_at<now()+interval '23 days')");
    await setTimeout(1000);
  }
} finally { await db.end(); }
