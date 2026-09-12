// Logica pura de presentacion de Situación/Dashboard (Paso 2C-1) - sin DOM,
// comprobable con node:test (mismo patron que profile-form.js). Nunca
// calcula relevancia/riesgo/oportunidad/confianza: solo reorganiza campos
// YA calculados por backend/radar/ para que los componentes los rendericen
// (prompt seccion 16 - prohibido duplicar esa lógica en frontend).

// itemsByIntelligenceType(): aplana los items de GET /profiles/:id/radar
// (changes/risks/opportunities, todos con la misma forma
// {activity_id, personalized_relevance, signal, intelligence[]}) a UNA
// entrada por unidad de inteligencia - un item puede tener mas de una
// unidad (p. ej. direct_dependency + value_chain_relation), y filtrar antes
// de aplanar perdería unidades reales. `type=null` no filtra (usado por
// "¿Qué cambió para mí?", que muestra todas las unidades sin distinción).
export function itemsByIntelligenceType(items, type = null) {
  return items.flatMap((item) =>
    item.intelligence.filter((intel) => !type || intel.type === type).map((intel) => ({ item, intel }))
  );
}

// monitorEntries(): de los items de radar.monitor, extrae la recomendación
// especifica de tipo monitor/seek_information que los clasificó como tales
// (backend/radar/build.js#monitorItems ya filtró los items; esto solo
// localiza CUÁL decisión/recomendación dentro del item fue la razón, para
// poder mostrar su texto real sin adivinar cuál era).
export function monitorEntries(items) {
  const entries = [];
  for (const item of items) {
    for (const intel of item.intelligence) {
      for (const decision of intel.decisions) {
        const rec = decision.recommendation;
        if (rec && (rec.type === 'monitor' || rec.type === 'seek_information')) {
          entries.push({ item, intel, rec });
        }
      }
    }
  }
  return entries;
}

// primaryActivityId(): busca, entre los items YA recibidos (sin una llamada
// adicional a GET /profiles/:id - prompt seccion 9, minimizar llamadas), la
// actividad marcada is_primary_activity por el backend. Devuelve null si no
// hay ninguna (perfil sin actividad principal, o sin cambios relevantes) -
// nunca se inventa un valor por defecto.
export function primaryActivityId(items) {
  return items.find((item) => item.is_primary_activity)?.activity_id ?? null;
}
