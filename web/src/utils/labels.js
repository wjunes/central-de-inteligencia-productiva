// Etiquetas en español de los vocabularios reales del backend (verificados en
// docs/arquitectura/contrato-radar.md y contra el código real de
// knowledge/intelligence/intelligence-types.json,
// knowledge/recommendations/recommendation-types.json,
// intelligence/recommendations/recommendations.js#typeFor). Módulo puro, sin
// DOM - un solo lugar para estas tablas, usado por components/intelligence-item.js
// (Situación, Paso 2C-1) y por los componentes de Radar (Paso 2D-2) para no
// duplicar la misma taxonomía en dos archivos. Cualquier valor no catalogado
// aquí se muestra tal cual (nunca se inventa una traducción ni se oculta -
// prompt de QA 2C-2 seccion 19: "valor semántico desconocido -> fallback
// seguro, no inventar significado").

export const TYPE_LABEL = { risk: 'Riesgo', opportunity: 'Oportunidad', impact: 'Impacto', trend: 'Tendencia' };

export const DIRECTION_LABEL = { increase: 'Aumentó', decrease: 'Disminuyó', stable: 'Sin cambios', mixed: 'Mixto', uncertain: 'Dirección incierta' };

export const EVIDENCE_LABEL = {
  structural_relationship: 'Relación estructural',
  strong: 'Evidencia fuerte',
  moderate: 'Evidencia moderada',
  limited: 'Evidencia limitada',
  insufficient: 'Evidencia insuficiente',
  conflicting: 'Evidencia contradictoria',
};

export const CONFIDENCE_LABEL = { very_high: 'Confianza muy alta', high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja' };

export const RELEVANCE_LABEL = { critical: 'Relevancia crítica', high: 'Relevancia alta', medium: 'Relevancia media', low: 'Relevancia baja', none: 'Sin relevancia' };

export const SITUATION_STATUS_LABEL = { emerging: 'Emergente', active: 'Activa', persistent: 'Persistente', resolved: 'Resuelta' };

export const TREND_STATUS_LABEL = { confirmed: 'Tendencia confirmada', insufficient_evidence: 'Evidencia insuficiente para tendencia' };

// RECOMMENDATION_TYPE_LABEL: los 7 tipos que el motor real produce hoy
// (intelligence/recommendations/recommendations.js#typeFor, verificado en
// contrato-radar.md §15) - deliberadamente sin traducir "monitor"/"mitigate"/
// etc. como una orden ("debés...", "hacé..."), solo como una ETIQUETA de
// clasificación neutra. 'defer' está catalogado en
// knowledge/recommendations/recommendation-types.json pero ningún camino de
// código lo produce hoy (GAP 17.8, documentado, no corregido) - se incluye
// igual por si el motor llegara a producirlo, para no mostrar un valor crudo
// evitable.
export const RECOMMENDATION_TYPE_LABEL = {
  monitor: 'Monitorear',
  seek_information: 'Buscar información',
  prepare: 'Prepararse',
  mitigate: 'Mitigar',
  pursue_opportunity: 'Evaluar oportunidad',
  adjust: 'Ajustar',
  evaluate: 'Evaluar',
  defer: 'Postergar',
};

export const PRIORITY_LABEL = { low: 'Prioridad baja', medium: 'Prioridad media', high: 'Prioridad alta', critical: 'Prioridad crítica', none: 'Sin prioridad asignada' };

// DECISION_ALT_KIND_LABEL: distingue la alternativa 'no_action' (siempre
// presente, decision/decision.js#buildAlternatives) de la accional - nunca se
// etiqueta ninguna como "mejor opción" (el backend no produce `best_option`,
// contrato §14).
export const DECISION_ALT_KIND_LABEL = { no_action: 'Alternativa: no actuar (monitoreo habitual)', action: 'Alternativa evaluada' };

// CLAIM_TYPE_LABEL (Paso 2E-2): los 10 tipos reales de `report_claims`
// (backend/reports/claims.js#TEMPLATES, verificado en contrato-informes.md
// §5) - un claim de informe es más plano que un item de Radar (no trae
// intelligence[]/decisions[] anidados, solo {type, text, importance,
// evidence_level, references}), por eso usa su propia etiqueta de tipo en
// vez de TYPE_LABEL (que es específico de intelligence.type). 'fact' está
// catalogado pero ningún claim real lo usa hoy (claims.js nunca lo invoca) -
// se incluye igual por completitud/robustez, nunca se oculta un valor no
// catalogado (fallback al valor crudo, mismo principio que el resto de este
// archivo).
export const CLAIM_TYPE_LABEL = {
  fact: 'Dato', change: 'Cambio', trend: 'Tendencia', impact: 'Impacto', risk: 'Riesgo',
  opportunity: 'Oportunidad', decision: 'Decisión', recommendation: 'Recomendación',
  uncertainty: 'Incertidumbre', comparison: 'Comparación',
};
