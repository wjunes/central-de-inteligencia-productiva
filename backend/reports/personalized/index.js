// Reporte personalizado (prompt seccion 4.6): usa el perfil completo
// (actividad principal/secundarias, mercados, productos, insumos,
// prioridades, restricciones) - responde especialmente "¿qué cambió para mí?".
import { getChanges } from '../../core/profile/personalize.js';
import { getProfile } from '../../core/profile/store.js';

export function selectScope(db, { profileId }) {
  if (!profileId) throw new Error('reporte personalizado: profileId es obligatorio');
  const profile = getProfile(db, profileId);
  if (!profile) throw new Error(`reporte personalizado: perfil desconocido '${profileId}'`);
  const changes = getChanges(db, profileId);
  return {
    items: changes.no_relevant_changes ? [] : changes.changes,
    title: `Reporte personalizado — ${profile.name}`,
    scope: {
      profile_id: profileId,
      main_activity_id: profile.main_activity_id,
      activities: profile.activities,
      markets: profile.markets,
      products: profile.products,
      inputs: profile.inputs,
      priorities: profile.priorities,
      constraints: profile.constraints,
    },
  };
}
