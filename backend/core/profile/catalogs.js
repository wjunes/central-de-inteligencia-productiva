// Catálogos de solo lectura para construir la edición del Perfil Productivo
// (GAP crítico de la etapa de Arquitectura Funcional y UX/UI - ver
// docs/producto/arquitectura-funcional-ux.md, seccion 11.2). No agrega
// conocimiento: cada valor devuelto viene, sin transformar su significado,
// de las mismas funciones de knowledge/loader.js que ya usa
// core/profile/store.js para VALIDAR (activities/marketDimensions/
// topicCatalog/decisionConstraintCategories/decisionConstraintSeverities),
// más sectors() (accessor nuevo en loader.js, mismo patrón, para completar la
// jerarquía SECTOR → ACTIVIDAD → SUBACTIVIDAD que activities.json ya declara
// via sector_id/level/parent_id/subactivities).
//
// Regla de esta capa: nunca inventa un campo que no exista en knowledge/, y
// nunca devuelve más de lo que la pantalla de Perfil necesita (id/name para
// selección e identificación, más los campos de jerarquía). knowledge/ sigue
// siendo la única fuente de verdad - esto es una proyección, no una copia.
import { knowledge } from '../../knowledge/loader.js';

function activityItem(a) {
  return {
    id: a.id,
    name: a.name,
    sector_id: a.sector_id,
    level: a.level, // 'activity' | 'subactivity'
    parent_id: a.parent_id,
    subactivities: a.subactivities ?? [],
  };
}

export function getProfileCatalogs() {
  return {
    activities: {
      sectors: knowledge.sectors().map((s) => ({ id: s.id, name: s.name, description: s.description, order: s.order })),
      items: knowledge.activities().map(activityItem),
    },
    markets: {
      market_dimensions: knowledge.marketDimensions(),
    },
    topics: knowledge.topicCatalog().map((t) => ({ id: t.id, name: t.name, description: t.description })),
    constraints: {
      categories: knowledge.decisionConstraintCategoriesDetailed().map((c) => ({ id: c.id, name: c.name, example: c.example ?? null })),
      severities: knowledge.decisionConstraintSeverities(),
    },
  };
}
