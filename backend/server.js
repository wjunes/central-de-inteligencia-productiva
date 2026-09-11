import { createServer } from 'node:http';
import { config, safeLogFields } from './config.js';
import { getDb } from './db/connection.js';
import { createRouter } from './api/router.js';

const db = getDb(config.dbPath);
const handle = createRouter(db);
const server = createServer((req, res) => handle(req, res));

server.listen(config.port, () => {
  console.log(`[server] CIP backend escuchando en :${config.port} (env=${config.nodeEnv})`, safeLogFields({}));
});
