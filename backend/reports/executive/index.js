// Reporte ejecutivo (prompt seccion 4.1): síntesis compacta. Con perfil, usa
// sus cambios ya personalizados; sin perfil, se acota a relevance_level
// critical/high en todo el sistema (una síntesis, no un volcado completo -
// "no crear un nuevo dashboard", pero tampoco listar todo el conocimiento).
// Nueva carpeta (no estaba en el scaffold original de backend/reports/):
// ninguna de las 5 carpetas existentes (markets/opportunities/personalized/
// risks/sectorial) encajaba con una síntesis transversal.
import { itemsForActivities } from '../select.js';
import { getChanges } from '../../core/profile/personalize.js';
import { getProfile } from '../../core/profile/store.js';
import { knowledge } from '../../knowledge/loader.js';

const HIGH_LEVELS = new Set(['critical', 'high']);

export function selectScope(db, { profileId } = {}) {
  if (profileId) {
    const profile = getProfile(db, profileId);
    if (!profile) throw new Error(`reporte ejecutivo: perfil desconocido '${profileId}'`);
    const changes = getChanges(db, profileId);
    return {
      items: changes.no_relevant_changes ? [] : changes.changes,
      title: `Reporte ejecutivo — ${profile.name}`,
      scope: { profile_id: profileId },
    };
  }
  const allActivities = knowledge.activities().map((a) => a.id);
  const items = itemsForActivities(db, allActivities).filter((i) => HIGH_LEVELS.has(i.personalized_relevance.level));
  return { items, title: 'Reporte ejecutivo — síntesis general', scope: { profile_id: null, relevance_threshold: 'high_or_critical' } };
}
