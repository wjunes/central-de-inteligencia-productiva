import { createServer } from 'node:http';
import { config, safeLogFields } from './config.js';
import { getDb, closeDb } from './db/connection.js';
import { createRouter } from './api/router.js';
import { createScheduler } from './pipeline/scheduler.js';

const db = getDb(config.dbPath);

const scheduler = createScheduler(db, {
  intervalMs: config.scheduler.intervalMs,
  onTick: (info) => {
    if (config.nodeEnv === 'test') return; // silencioso en tests (integración vía server.js hijo)
    if (info.skipped) console.log('[scheduler] tick omitido:', info.reason);
    else if (info.error) console.error('[scheduler] tick con error no anticipado:', info.error.message);
    else console.log('[scheduler] tick completado:', safeLogFields({ run_id: info.result.runId, hadErrors: info.result.hadErrors }));
  },
});
if (config.scheduler.enabled) scheduler.start();

const handle = createRouter(db, { scheduler });
const server = createServer((req, res) => handle(req, res));

server.listen(config.port, () => {
  console.log(
    `[server] CIP backend escuchando en :${config.port} (env=${config.nodeEnv}, scheduler=${config.scheduler.enabled ? 'activo' : 'inactivo'})`,
    safeLogFields({})
  );
});

// Apagado limpio (Fase ARRANQUE Y APAGADO): libera el timer del scheduler,
// deja de aceptar conexiones nuevas y cierra la conexión SQLite antes de
// salir - nunca deja el proceso colgado ni corta una escritura a mitad.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] recibido ${signal}, cerrando...`);
  scheduler.stop();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
