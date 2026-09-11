// Persistencia de narrativas: NO se guarda de nuevo el reporte, solo texto +
// claim_ids referenciados + resultado de validación (prompt seccion 27).
// Versionado por (report_id, mode, provider) - misma disciplina de supersede
// que reports/store.js y recommendations.js.
import { randomUUID } from 'node:crypto';

function findActiveNarrative(db, reportId, mode, provider) {
  return db
    .prepare("SELECT * FROM report_narratives WHERE report_id = ? AND mode = ? AND (provider IS ? OR provider = ?) AND status != 'superseded' ORDER BY created_at DESC LIMIT 1")
    .get(reportId, mode, provider ?? null, provider ?? '');
}

export function createNarrative(db, { reportId, mode, provider = null, model = null, status, claimsUsed, validation, body }) {
  const previous = findActiveNarrative(db, reportId, mode, provider);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const version = previous ? previous.version + 1 : 1;

  if (previous) {
    db.prepare("UPDATE report_narratives SET status = 'superseded' WHERE id = ?").run(previous.id);
  }

  db.prepare(
    `INSERT INTO report_narratives (id, report_id, mode, provider, model, status, created_at, version, previous_version_id, claims_used, validation, body)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, reportId, mode, provider, model, status, createdAt, version, previous?.id ?? null, JSON.stringify(claimsUsed), JSON.stringify(validation), JSON.stringify(body));

  return getNarrative(db, id);
}

export function getNarrative(db, id) {
  const row = db.prepare('SELECT * FROM report_narratives WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, claims_used: JSON.parse(row.claims_used), validation: JSON.parse(row.validation), body: JSON.parse(row.body) };
}

export function getLatestNarrative(db, reportId) {
  const row = db.prepare("SELECT * FROM report_narratives WHERE report_id = ? AND status != 'superseded' ORDER BY created_at DESC LIMIT 1").get(reportId);
  return row ? getNarrative(db, row.id) : null;
}

export function listNarratives(db, reportId) {
  return db.prepare('SELECT id, mode, provider, status, version, created_at FROM report_narratives WHERE report_id = ? ORDER BY created_at DESC').all(reportId);
}
