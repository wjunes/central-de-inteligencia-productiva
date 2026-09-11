// CRUD de perfiles productivos. Solo referencias a knowledge/ (ids), nunca
// copias (prompt de perfil productivo, seccion 1/26). Cada entrada valida
// su id contra el vocabulario correspondiente ya existente - no se acepta
// un nombre libre cuando existe una actividad/ramificación/mercado/tema
// normalizado (seccion 5).
import { randomUUID } from 'node:crypto';
import { knowledge } from '../../knowledge/loader.js';

export class ValidationError extends Error {}

function requireActivity(activityId) {
  const activity = knowledge.activityById(activityId);
  if (!activity) throw new ValidationError(`activity_id desconocido: '${activityId}' (no existe en knowledge/activities/activities.json)`);
  return activity;
}

function requireMarket(marketId) {
  if (!knowledge.marketDimensions().includes(marketId)) {
    throw new ValidationError(`market_id desconocido: '${marketId}' (no existe en domain-names/mercados.json#mercados-destino.market_dimensions)`);
  }
}

function requireTopic(topicId) {
  if (!knowledge.topicCatalog().some((t) => t.id === topicId)) {
    throw new ValidationError(`topic_id desconocido: '${topicId}' (no existe en ramifications/_signal_types.json)`);
  }
}

function requireRamification(activityId, ramificationId) {
  requireActivity(activityId);
  const node = knowledge.findRamificationNode(activityId, ramificationId);
  if (!node) throw new ValidationError(`ramification_id '${ramificationId}' no existe dentro de ramifications/${activityId}.json`);
  return node;
}

function requireConstraint(category, severity) {
  if (!knowledge.decisionConstraintCategories().includes(category)) {
    throw new ValidationError(`categoría de restricción desconocida: '${category}' (ver decision/constraints.json.categories)`);
  }
  if (!knowledge.decisionConstraintSeverities().includes(severity)) {
    throw new ValidationError(`severidad de restricción desconocida: '${severity}' (ver decision/constraints.json.severity)`);
  }
}

export function createProfile(db, input) {
  const { name, role = null, main_activity_id = null, location = null, scale = null, horizon = null } = input;
  if (!name) throw new ValidationError('name es obligatorio');
  if (main_activity_id) requireActivity(main_activity_id);

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO profiles (id, name, role, main_activity_id, location, scale, horizon, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, role, main_activity_id, location, scale, horizon, now, now);

  if (main_activity_id) {
    db.prepare('INSERT INTO profile_activities (id, profile_id, activity_id, kind) VALUES (?, ?, ?, ?)').run(randomUUID(), id, main_activity_id, 'main');
  }

  return getProfile(db, id);
}

export function updateProfile(db, id, patch) {
  const existing = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  if (!existing) return null;
  if (patch.main_activity_id) requireActivity(patch.main_activity_id);

  const merged = { ...existing, ...patch };
  db.prepare(
    `UPDATE profiles SET name = ?, role = ?, main_activity_id = ?, location = ?, scale = ?, horizon = ?, updated_at = ? WHERE id = ?`
  ).run(merged.name, merged.role, merged.main_activity_id, merged.location, merged.scale, merged.horizon, new Date().toISOString(), id);

  if (patch.main_activity_id && patch.main_activity_id !== existing.main_activity_id) {
    // re-etiqueta: la actividad principal anterior pasa a secundaria, la nueva se marca main.
    db.prepare("UPDATE profile_activities SET kind = 'secondary' WHERE profile_id = ? AND kind = 'main'").run(id);
    const already = db.prepare('SELECT id FROM profile_activities WHERE profile_id = ? AND activity_id = ?').get(id, patch.main_activity_id);
    if (already) db.prepare("UPDATE profile_activities SET kind = 'main' WHERE id = ?").run(already.id);
    else db.prepare('INSERT INTO profile_activities (id, profile_id, activity_id, kind) VALUES (?, ?, ?, ?)').run(randomUUID(), id, patch.main_activity_id, 'main');
  }

  return getProfile(db, id);
}

export function deleteProfile(db, id) {
  const result = db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  return result.changes > 0;
}

export function listProfiles(db) {
  return db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all();
}

export function getProfile(db, id) {
  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  if (!profile) return null;
  return {
    ...profile,
    activities: db.prepare('SELECT activity_id, kind FROM profile_activities WHERE profile_id = ?').all(id),
    markets: db.prepare('SELECT market_id FROM profile_markets WHERE profile_id = ?').all(id).map((r) => r.market_id),
    products: db.prepare('SELECT activity_id, ramification_id FROM profile_products WHERE profile_id = ?').all(id),
    inputs: db.prepare('SELECT activity_id, ramification_id FROM profile_inputs WHERE profile_id = ?').all(id),
    priorities: db.prepare('SELECT topic_id, rank FROM profile_priorities WHERE profile_id = ? ORDER BY rank ASC').all(id),
    constraints: db.prepare('SELECT category, severity, description FROM profile_constraints WHERE profile_id = ?').all(id),
  };
}

// setActivities: reemplaza el conjunto de actividades (main + secondary) del
// perfil. activityIds debe incluir main_activity_id si corresponde.
export function setActivities(db, profileId, { main_activity_id = null, secondary_activity_ids = [] }) {
  if (main_activity_id) requireActivity(main_activity_id);
  for (const aid of secondary_activity_ids) requireActivity(aid);

  db.prepare('DELETE FROM profile_activities WHERE profile_id = ?').run(profileId);
  if (main_activity_id) {
    db.prepare('INSERT INTO profile_activities (id, profile_id, activity_id, kind) VALUES (?, ?, ?, ?)').run(randomUUID(), profileId, main_activity_id, 'main');
    db.prepare('UPDATE profiles SET main_activity_id = ?, updated_at = ? WHERE id = ?').run(main_activity_id, new Date().toISOString(), profileId);
  }
  for (const aid of secondary_activity_ids) {
    if (aid === main_activity_id) continue;
    db.prepare('INSERT INTO profile_activities (id, profile_id, activity_id, kind) VALUES (?, ?, ?, ?)').run(randomUUID(), profileId, aid, 'secondary');
  }
  return getProfile(db, profileId);
}

export function setMarkets(db, profileId, marketIds) {
  for (const m of marketIds) requireMarket(m);
  db.prepare('DELETE FROM profile_markets WHERE profile_id = ?').run(profileId);
  for (const m of marketIds) db.prepare('INSERT INTO profile_markets (id, profile_id, market_id) VALUES (?, ?, ?)').run(randomUUID(), profileId, m);
  return getProfile(db, profileId);
}

export function setProducts(db, profileId, products) {
  for (const p of products) requireRamification(p.activity_id, p.ramification_id);
  db.prepare('DELETE FROM profile_products WHERE profile_id = ?').run(profileId);
  for (const p of products) db.prepare('INSERT INTO profile_products (id, profile_id, activity_id, ramification_id) VALUES (?, ?, ?, ?)').run(randomUUID(), profileId, p.activity_id, p.ramification_id);
  return getProfile(db, profileId);
}

export function setInputs(db, profileId, inputs) {
  for (const p of inputs) requireRamification(p.activity_id, p.ramification_id);
  db.prepare('DELETE FROM profile_inputs WHERE profile_id = ?').run(profileId);
  for (const p of inputs) db.prepare('INSERT INTO profile_inputs (id, profile_id, activity_id, ramification_id) VALUES (?, ?, ?, ?)').run(randomUUID(), profileId, p.activity_id, p.ramification_id);
  return getProfile(db, profileId);
}

export function setPriorities(db, profileId, priorities) {
  for (const p of priorities) requireTopic(p.topic_id);
  db.prepare('DELETE FROM profile_priorities WHERE profile_id = ?').run(profileId);
  priorities.forEach((p, i) => {
    db.prepare('INSERT INTO profile_priorities (id, profile_id, topic_id, rank) VALUES (?, ?, ?, ?)').run(randomUUID(), profileId, p.topic_id, p.rank ?? i + 1);
  });
  return getProfile(db, profileId);
}

export function setConstraints(db, profileId, constraints) {
  for (const c of constraints) requireConstraint(c.category, c.severity);
  db.prepare('DELETE FROM profile_constraints WHERE profile_id = ?').run(profileId);
  for (const c of constraints) {
    db.prepare('INSERT INTO profile_constraints (id, profile_id, category, severity, description) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), profileId, c.category, c.severity, c.description ?? null);
  }
  return getProfile(db, profileId);
}
