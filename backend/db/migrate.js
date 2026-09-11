// Aplica knowledge/../db/schema.sql (idempotente - CREATE TABLE IF NOT EXISTS).
// getDb() ya aplica el esquema automaticamente al abrir la conexion; este
// script existe para poder ejecutar la migracion explicitamente (npm run migrate)
// sin levantar el servidor HTTP.
import { getDb, closeDb } from './connection.js';
import { config } from '../config.js';

const db = getDb(config.dbPath);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log(`[migrate] esquema aplicado en ${config.dbPath}. Tablas: ${tables.map((t) => t.name).join(', ')}`);
closeDb();
