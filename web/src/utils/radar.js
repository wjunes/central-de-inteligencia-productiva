// Lógica pura de la pantalla Radar Productivo (Paso 2D-2) - sin DOM,
// comprobable con node:test (mismo patrón que utils/situation.js de
// Situación). Ningún cálculo de relevancia/prioridad/riesgo/oportunidad: solo
// selecciona/filtra sobre arrays YA calculados por GET /profiles/:id/radar
// (docs/arquitectura/contrato-radar.md), tal como exige el prompt de esta
// etapa ("BACKEND = calcula, FRONTEND = presenta").

// Orden de presentación de los niveles de relevancia en el filtro (de mayor a
// menor) - es solo el orden de las OPCIONES del filtro, nunca un reordenamiento
// de los items mostrados (esos conservan el orden que trae el backend, ver
// contrato-radar.md §17).
const RELEVANCE_DISPLAY_ORDER = ['critical', 'high', 'medium', 'low', 'none'];

// uniqueActivityIds()/uniqueRelevanceLevels(): opciones de los filtros
// Actividad/Relevancia, calculadas sobre el universo completo de
// radar.changes.items (no sobre el subconjunto ya filtrado) - así las
// opciones no aparecen/desaparecen mientras el usuario combina filtros
// (docs/producto/arquitectura-radar-ux.md §13).
export function uniqueActivityIds(items) {
  return [...new Set(items.map((i) => i.activity_id))];
}

export function uniqueRelevanceLevels(items) {
  const present = new Set(items.map((i) => i.personalized_relevance.level));
  return RELEVANCE_DISPLAY_ORDER.filter((level) => present.has(level));
}

// changesForType(): el filtro "Tipo" NUNCA reclasifica un item - elige cuál
// de los 4 arrays YA CALCULADOS por buildRadar() mostrar (contrato §5.3:
// risks/opportunities/monitor son subconjuntos de cambios.changes, filtrados
// por el backend). No se reimplementa el criterio de clasificación en
// frontend - simplemente se elige el array correspondiente.
export function changesForType(radar, type) {
  if (type === 'risk') return radar.risks;
  if (type === 'opportunity') return radar.opportunities;
  if (type === 'monitor') return radar.monitor;
  return radar.changes.items; // 'all' / valor por defecto
}

// applyChangeFilters(): compone Tipo + Actividad + Relevancia. Cada paso es
// un Array#filter por igualdad de un campo YA presente en el item - nunca una
// comparación derivada ni un nuevo cálculo. Array#filter preserva el orden
// original (contrato §17), esta función nunca reordena.
export function applyChangeFilters(radar, { type = 'all', activityId = null, relevanceLevel = null } = {}) {
  let items = changesForType(radar, type);
  if (activityId) items = items.filter((item) => item.activity_id === activityId);
  if (relevanceLevel) items = items.filter((item) => item.personalized_relevance.level === relevanceLevel);
  return items;
}

// filterSituations()/filterRecommendations(): el filtro de Actividad también
// reduce Situaciones y Recomendaciones (docs/producto/arquitectura-radar-ux.md
// §25, flujo 8) - Relevancia solo aplica a Situaciones (las recomendaciones no
// tienen personalized_relevance propio, contrato §5.4) y el filtro de Tipo es
// exclusivo de Cambios (no tiene sentido contractual para Situaciones/
// Recomendaciones, que no se clasifican en risk/opportunity/monitor de la
// misma manera).
export function filterSituations(situations, { activityId = null, relevanceLevel = null } = {}) {
  let items = situations;
  if (activityId) items = items.filter((s) => s.activity_ids.includes(activityId));
  if (relevanceLevel) items = items.filter((s) => s.personalized_relevance.level === relevanceLevel);
  return items;
}

export function filterRecommendations(recommendations, { activityId = null } = {}) {
  return activityId ? recommendations.filter((r) => r.activity_id === activityId) : recommendations;
}

// resolveMemberDirection(): situation.members[] no trae su propia dirección
// (contrato §5.2/§6 de arquitectura-radar-ux.md) - se resuelve por CRUCE en
// memoria contra radar.changes.items, que SÍ trae signal.direction para la
// misma señal+actividad. Es una búsqueda de referencia dentro de datos ya
// recibidos en la MISMA respuesta, nunca una segunda petición ni un cálculo
// de negocio. Devuelve null si no hay coincidencia (nunca inventa una
// dirección) - puede pasar si el miembro pertenece a una situación
// 'resolved' cuya señal ya no aparece en cambios.changes.items vigentes.
export function resolveMemberDirection(member, changesItems) {
  const match = changesItems.find((c) => c.activity_id === member.activity_id && c.signal.id === member.signal_id);
  return match ? match.signal.direction : null;
}

// findDecisionForRecommendation(): desde la sección plana de Recomendaciones,
// intenta ubicar la decisión de la que depende `recommendation.decision_id`
// dentro de las decisiones ya anidadas en radar.changes.items - de nuevo,
// solo una búsqueda dentro del mismo payload. Devuelve null si no se
// encuentra (puede pertenecer a una corrida anterior cuya intelligence ya no
// es "relevante" hoy - contrato §16/GAP 17.7): en ese caso la UI no debe
// fabricar un vínculo, solo mostrar la recomendación sola.
export function findDecisionForRecommendation(recommendation, changesItems) {
  for (const item of changesItems) {
    for (const intel of item.intelligence) {
      for (const decision of intel.decisions) {
        if (decision.id === recommendation.decision_id) return { item, intel, decision };
      }
    }
  }
  return null;
}

// changeItemKey()/situationKey(): identificadores estables para un item de
// cambios/una situación, usados por pages/radar.js para preservar qué
// <details> estaba abierto entre un cambio de filtro y el siguiente (QA Paso
// 2D-3: sin esto, cambiar CUALQUIER filtro reconstruye todo el árbol de la
// pantalla desde cero y colapsa cualquier <details> que el usuario hubiera
// expandido - un cambio de filtro no debería descartar la exploración en
// curso). No es un id propio del contrato - se compone de campos ya
// presentes y suficientemente únicos dentro de una misma respuesta
// (activity_id+signal.id identifica un item de cambios sin ambigüedad;
// situation.id ya es único por construcción, radar/situations.js#upsertSituations).
export function changeItemKey(item) {
  return `change::${item.activity_id}::${item.signal?.id ?? ''}`;
}

export function situationKey(situation) {
  return `situation::${situation.id}`;
}
