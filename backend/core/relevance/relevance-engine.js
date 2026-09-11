// calculateRelevance(): interpreta knowledge/relevance/ (levels.json +
// mappings.json ya precalculado) - no recalcula la taxonomia ni el grafo,
// solo lo consulta (prompt del motor operativo, seccion 14).
//
// CORRECCION QUIRURGICA (etapa de perfil productivo, ver backend/README.md
// #Problemas detectados): esta funcion ANTES recibia un profileContext y
// calculaba is_primary_activity en el momento de generar la relevancia
// CENTRAL. Eso violaba el principio de procesamiento centralizado (una
// senal/relevancia no puede conocer ningun perfil - section 1/29 del prompt
// de perfil productivo): si dos perfiles distintos disparaban el pipeline,
// la segunda corrida no debia reprocesar nada, pero is_primary_activity
// quedaba fijo segun el PRIMER perfil que la calculo. is_primary_activity
// se calcula ahora en core/profile/personalize.js, en el momento de
// consulta, contra el perfil que efectivamente pregunta - nunca aqui.
// La columna is_primary_activity de relevance_results ya no se usa (se deja
// en el esquema para no romper compatibilidad, siempre se inserta 0/false).
import { randomUUID } from 'node:crypto';
import { knowledge } from '../../knowledge/loader.js';

export function calculateRelevance(db, runId, signal) {
  const results = [];

  // 1) direct_dependency: la propia actividad de origen de la señal.
  if (signal.origin_activity_id) {
    let level = 'medium';
    let reason = 'actividad de origen de la señal';
    if (signal.origin_ramification_id) {
      const node = knowledge.findRamificationNode(signal.origin_activity_id, signal.origin_ramification_id);
      if (node) {
        level = node.relevance ?? 'medium';
        reason = `ramificación de origen '${node.id}' (category=${node.category})`;
      }
    }
    results.push(persist(db, runId, signal.id, signal.origin_activity_id, level, 'direct_dependency', reason, [{ ramification_id: signal.origin_ramification_id }]));
  }

  // 2) value_chain_relation: grafo ya precalculado de relevance/mappings.json.
  if (signal.origin_activity_id) {
    const graph = knowledge.relevanceMappings();
    const edges = graph[signal.origin_activity_id] ?? [];
    for (const edge of edges) {
      results.push(
        persist(db, runId, signal.id, edge.target_activity_id, edge.relevance_level, 'value_chain_relation', edge.reason, edge.evidence)
      );
    }
  }

  return results;
}

function persist(db, runId, signalId, activityId, level, factor, reason, evidence) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO relevance_results (id, run_id, signal_id, activity_id, relevance_level, factor, reason, evidence, is_primary_activity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(id, runId, signalId, activityId, level, factor, reason ?? null, JSON.stringify(evidence ?? []));
  return { id, run_id: runId, signal_id: signalId, activity_id: activityId, relevance_level: level, factor, reason, evidence, is_primary_activity: false };
}
