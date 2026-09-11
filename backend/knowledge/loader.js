// Unica puerta de entrada a knowledge/ desde el backend. Lee, cachea en
// memoria, y NUNCA copia/reescribe conocimiento - el backend "consume" estas
// capas (prompt del motor operativo, seccion 3), no las reconstruye.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// backend/knowledge -> repo root
const REPO_ROOT = join(__dirname, '..', '..');
const KNOWLEDGE_ROOT = join(REPO_ROOT, 'knowledge');

const cache = new Map();

function readJson(relPath) {
  if (cache.has(relPath)) return cache.get(relPath);
  const full = join(KNOWLEDGE_ROOT, relPath);
  const data = JSON.parse(readFileSync(full, 'utf-8'));
  cache.set(relPath, data);
  return data;
}

export const knowledge = {
  sources: () => readJson('sources/sources.json').sources,
  sourcesMappings: () => readJson('sources/mappings.json'),
  monitors: () => readJson('monitoring/monitors.json').monitors,
  methods: () => readJson('monitoring/methods.json'),
  changeDetection: () => readJson('monitoring/change-detection.json'),
  frequencies: () => readJson('monitoring/frequencies.json'),
  signalTypes: () => readJson('signals/signal-types.json'),
  signalRules: () => readJson('signals/rules.json'),
  topicCatalog: () => readJson('ramifications/_signal_types.json').signal_types,
  relevanceLevels: () => readJson('relevance/levels.json').levels,
  relevanceMappings: () => readJson('relevance/mappings.json').activity_relevance_graph,
  intelligenceTypes: () => readJson('intelligence/intelligence-types.json'),
  intelligenceRules: () => readJson('intelligence/rules.json'),
  decisionTypes: () => readJson('decision/decision-types.json').decision_types,
  decisionRules: () => readJson('decision/rules.json'),
  decisionCriteria: () => readJson('decision/criteria.json'),
  recommendationTypes: () => readJson('recommendations/recommendation-types.json').recommendation_types,
  recommendationCriteria: () => readJson('recommendations/criteria.json'),
  recommendationRules: () => readJson('recommendations/rules.json'),

  // Perfil productivo (nuevo en esta etapa): vocabularios ya existentes que
  // validan las entradas de profile_markets/profile_priorities/profile_constraints
  // - ninguno se duplica, solo se referencia.
  activities: () => readJson('activities/activities.json').activities,
  activityById(activityId) {
    return knowledge.activities().find((a) => a.id === activityId) ?? null;
  },
  marketDimensions() {
    const doc = readJson('domain-names/mercados.json');
    const dest = doc.domains.find((d) => d.id === 'mercados-destino');
    return dest?.market_dimensions ?? [];
  },
  decisionConstraintCategories: () => readJson('decision/constraints.json').categories.map((c) => c.id),
  decisionConstraintSeverities: () => readJson('decision/constraints.json').severity.values,

  // Ramificaciones: resuelve herencia de subactividades (misma logica que los
  // generate.py de relevance/ e intelligence/, reimplementada en JS porque el
  // backend no ejecuta Python). Devuelve la lista efectiva de nodos top-level.
  effectiveRamifications(activityId) {
    const key = `__effective__${activityId}`;
    if (cache.has(key)) return cache.get(key);
    const d = readJson(`ramifications/${activityId}.json`);
    let result;
    if (d.ramifications) {
      result = d.ramifications;
    } else {
      const parent = knowledge.effectiveRamifications(d.inherits_from);
      const removeIds = new Set(
        (d.ramification_deltas.remove || []).map((r) => (typeof r === 'string' ? r : r.id))
      );
      const modifyById = new Map((d.ramification_deltas.modify || []).map((m) => [m.id, m]));
      const add = d.ramification_deltas.add || [];
      result = [];
      for (const node of parent) {
        if (removeIds.has(node.id)) continue;
        if (modifyById.has(node.id)) {
          const mod = modifyById.get(node.id);
          const merged = { ...node };
          for (const [k, v] of Object.entries(mod)) {
            if (k !== 'reason') merged[k] = v;
          }
          result.push(merged);
        } else {
          result.push(node);
        }
      }
      result = result.concat(add);
    }
    cache.set(key, result);
    return result;
  },

  // Busca un nodo de ramificacion por id (recursivo en children) dentro del
  // set efectivo de una actividad. Devuelve null si no existe.
  findRamificationNode(activityId, ramificationId) {
    const roots = knowledge.effectiveRamifications(activityId);
    const stack = [...roots];
    while (stack.length) {
      const n = stack.pop();
      if (n.id === ramificationId) return n;
      if (n.children) stack.push(...n.children);
    }
    return null;
  },

  sourceById(sourceId) {
    return knowledge.sources().find((s) => s.id === sourceId) ?? null;
  },

  monitorById(monitorId) {
    return knowledge.monitors().find((m) => m.id === monitorId) ?? null;
  },
};
