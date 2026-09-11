// Persistencia de reportes: snapshot + report + claims + fuentes. Versionado
// por (type, scope JSON) - misma disciplina que recommendations.js: una
// nueva generación con el mismo alcance sucede a la anterior (previous_version_id),
// nunca la borra (prompt seccion 20).
import { randomUUID } from 'node:crypto';
import { knowledge } from '../knowledge/loader.js';

function scopeSignature(type, scope) {
  return `${type}::${JSON.stringify(scope, Object.keys(scope).sort())}`;
}

export function createSnapshot(db, { cutoffAt, situationIds = [], intelligenceIds = [], decisionIds = [], recommendationIds = [], signalIds = [] }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO report_snapshots (id, created_at, cutoff_at, situation_ids, intelligence_ids, decision_ids, recommendation_ids, signal_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, new Date().toISOString(), cutoffAt, JSON.stringify(situationIds), JSON.stringify(intelligenceIds), JSON.stringify(decisionIds), JSON.stringify(recommendationIds), JSON.stringify(signalIds));
  return id;
}

function findActiveReportBySignature(db, signature) {
  const candidates = db.prepare("SELECT * FROM reports WHERE status != 'superseded' AND status != 'archived'").all();
  return candidates.find((r) => scopeSignature(r.type, JSON.parse(r.scope)) === signature) ?? null;
}

export function createReport(db, { type, title, scope, profileId = null, cutoffAt, periodStart = null, periodEnd = null, rulesVersion, snapshotId, body, claims, sourceIds }) {
  const signature = scopeSignature(type, scope);
  const previous = findActiveReportBySignature(db, signature);

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const version = previous ? previous.version + 1 : 1;

  if (previous) {
    db.prepare("UPDATE reports SET status = 'superseded' WHERE id = ?").run(previous.id);
  }

  db.prepare(
    `INSERT INTO reports (id, type, title, scope, profile_id, created_at, cutoff_at, period_start, period_end, rules_version, snapshot_id, status, version, previous_version_id, body)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?)`
  ).run(id, type, title, JSON.stringify(scope), profileId, createdAt, cutoffAt, periodStart, periodEnd, rulesVersion, snapshotId, version, previous?.id ?? null, JSON.stringify(body));

  for (const claim of claims) {
    db.prepare(
      `INSERT INTO report_claims (id, report_id, section, type, activity_id, text, importance, evidence_level, confidence, references_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(claim.id, id, claim.section, claim.type, claim.activity_id, claim.text, claim.importance, claim.evidence_level, claim.confidence ? JSON.stringify(claim.confidence) : null, JSON.stringify(claim.references));
  }

  for (const sourceId of sourceIds) {
    db.prepare('INSERT OR IGNORE INTO report_sources (id, report_id, source_id) VALUES (?, ?, ?)').run(randomUUID(), id, sourceId);
  }

  return getReport(db, id);
}

export function getReport(db, id) {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!report) return null;
  const claims = db.prepare('SELECT * FROM report_claims WHERE report_id = ?').all(id).map((c) => ({ ...c, confidence: c.confidence ? JSON.parse(c.confidence) : null, references: JSON.parse(c.references_json) }));
  const sources = db.prepare('SELECT source_id FROM report_sources WHERE report_id = ?').all(id).map((r) => r.source_id);
  const snapshot = db.prepare('SELECT * FROM report_snapshots WHERE id = ?').get(report.snapshot_id);
  return {
    ...report,
    scope: JSON.parse(report.scope),
    body: JSON.parse(report.body),
    claims,
    sources: sources.map((sid) => knowledge.sourceById(sid)).filter(Boolean),
    snapshot: snapshot
      ? { ...snapshot, situation_ids: JSON.parse(snapshot.situation_ids), intelligence_ids: JSON.parse(snapshot.intelligence_ids), decision_ids: JSON.parse(snapshot.decision_ids), recommendation_ids: JSON.parse(snapshot.recommendation_ids), signal_ids: JSON.parse(snapshot.signal_ids) }
      : null,
  };
}

export function listReports(db, { type, profileId } = {}) {
  let query = 'SELECT id, type, title, profile_id, status, version, created_at FROM reports WHERE 1=1';
  const params = [];
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (profileId) { query += ' AND profile_id = ?'; params.push(profileId); }
  query += ' ORDER BY created_at DESC';
  return db.prepare(query).all(...params);
}

export function getVersions(db, id) {
  const chain = [];
  let current = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  while (current) {
    chain.push({ id: current.id, version: current.version, status: current.status, created_at: current.created_at });
    current = current.previous_version_id ? db.prepare('SELECT * FROM reports WHERE id = ?').get(current.previous_version_id) : null;
  }
  return chain;
}

// getTraceability(): para cada claim, reconstruye la cadena hasta la fuente
// - nunca copia datos, solo sigue referencias ya existentes (prompt seccion 2).
export function getTraceability(db, reportId) {
  const claims = db.prepare('SELECT * FROM report_claims WHERE report_id = ?').all(reportId);
  return claims.map((claim) => {
    const refs = JSON.parse(claim.references_json);
    const chain = { claim_id: claim.id, section: claim.section, type: claim.type };
    if (refs.signal_id) {
      const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(refs.signal_id);
      if (signal) {
        chain.signal_id = signal.id;
        const change = db.prepare('SELECT * FROM changes WHERE id = ?').get(signal.change_id);
        if (change) {
          chain.change_id = change.id;
          const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(change.capture_id);
          if (capture) {
            chain.capture_id = capture.id;
            chain.source_id = capture.source_id;
            chain.institution = knowledge.sourceById(capture.source_id)?.institution ?? null;
          }
        }
      }
    }
    if (refs.intelligence_id) chain.intelligence_id = refs.intelligence_id;
    if (refs.decision_id) chain.decision_id = refs.decision_id;
    if (refs.recommendation_id) chain.recommendation_id = refs.recommendation_id;
    if (refs.situation_id) chain.situation_id = refs.situation_id;
    if (refs.activity_id) chain.activity_id = refs.activity_id;
    return chain;
  });
}
