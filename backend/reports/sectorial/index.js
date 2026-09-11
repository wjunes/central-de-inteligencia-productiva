// Reporte sectorial (prompt seccion 4.2): analiza UNA actividad/sector.
import { itemsForActivities } from '../select.js';
import { knowledge } from '../../knowledge/loader.js';

export function selectScope(db, { activityId }) {
  if (!activityId) throw new Error('reporte sectorial: activityId es obligatorio');
  const activity = knowledge.activityById(activityId);
  if (!activity) throw new Error(`reporte sectorial: activity_id desconocido '${activityId}'`);
  return {
    items: itemsForActivities(db, [activityId]),
    title: `Reporte sectorial — ${activity.name}`,
    scope: { activity_id: activityId },
  };
}
