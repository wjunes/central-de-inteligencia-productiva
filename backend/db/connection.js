// Conexion SQLite via node:sqlite (nativo de Node.js, sin dependencias npm).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');

let dbInstance = null;

export function getDb(dbPath) {
  if (dbInstance) return dbInstance;
  const path = dbPath ?? process.env.DB_PATH ?? './data/cip.sqlite';
  if (path !== ':memory:') {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  dbInstance = db;
  return db;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// Solo para tests: fuerza una conexion nueva (ej. :memory: por corrida de test).
export function resetDbForTests(dbPath = ':memory:') {
  closeDb();
  return getDb(dbPath);
}
