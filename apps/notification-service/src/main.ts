import { createPool } from './db.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';
const db = createPool(); const config = loadConfig(); const server = await createServer(db, config);
const stop = async () => { await server.close(); await db.end(); };
process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
await server.listen({ port: config.port, host: config.host });
