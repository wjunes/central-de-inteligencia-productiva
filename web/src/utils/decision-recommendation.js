// Lógica pura de la relación decisión -> recomendación (GAP 17.7, congelado
// en docs/arquitectura/contrato-decisiones-recomendaciones.md §4 y en
// docs/producto/arquitectura-decisiones-recomendaciones-ux.md §11). ÚNICO
// lugar del frontend donde se evalúa esta regla - decision-recommendation-
// link.js solo la consume, nunca la reimplementa (Paso 2F-2, Fase 6/11).
//
// Regla: `recommendation.decision_id` existe como campo, pero
// core/profile/personalize.js#decisionsAndRecommendations() resuelve la
// recomendación "vigente" de una decisión por activity_id, no comparando
// igualdad de ids. La única comprobación válida para lenguaje directo es la
// igualdad explícita de ids, ya presente en el payload - 0 llamadas nuevas,
// nunca se infiere por texto/actividad/topic/situación/proximidad temporal.

export function isDirectRelation(decisionId, recommendation) {
  return Boolean(decisionId) && Boolean(recommendation?.decision_id) && decisionId === recommendation.decision_id;
}

// relationLabel(): texto exacto congelado en la arquitectura UX - nunca
// "generada por esta decisión" salvo relación directa comprobada.
export function relationLabel(direct) {
  return direct ? 'Recomendación derivada de esta decisión' : 'Recomendación vigente para esta actividad';
}

// findDecisionForRecommendation(): usado únicamente por la sección plana de
// Recomendaciones de Radar (Fase 7), donde no hay un `decisionId` de
// contexto ya conocido - busca, entre las decisiones YA PRESENTES en el
// mismo payload de /radar (sin ninguna llamada adicional), si alguna
// verifica la igualdad de ids con esta recomendación. Si no la encuentra
// (p. ej. la decisión de origen pertenece a una corrida anterior y ya no es
// "relevante" hoy, por lo que no aparece en changes.items), devuelve null -
// nunca se inventa una decisión ni se busca por otro criterio.
export function findDecisionForRecommendation(recommendation, changeItems) {
  for (const item of changeItems ?? []) {
    for (const intel of item.intelligence ?? []) {
      for (const decision of intel.decisions ?? []) {
        if (isDirectRelation(decision.id, recommendation)) return decision;
      }
    }
  }
  return null;
}

// resolveMemberDirection(): la dirección de cada miembro de una situación no
// viaja como campo propio (contrato-radar.md §5.2) - se resuelve por cruce
// en memoria contra el signal_id ya presente en el mismo payload de /radar
// (arquitectura-radar-ux.md §6), nunca con una segunda petición ni un
// cálculo de negocio nuevo.
export function resolveMemberDirection(member, changeItems) {
  for (const item of changeItems ?? []) {
    if (item.signal?.id === member.signal_id) return item.signal.direction ?? null;
  }
  return null;
}
