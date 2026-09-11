// Reporte de riesgos (prompt seccion 4.4): concentrado en type=risk ya
// clasificado por intelligence/ - nunca infiere riesgo por signo de señal.
import { itemsForActivities, filterByType } from '../select.js';
import { knowledge } from '../../knowledge/loader.js';

export function selectScope(db, { activityIds } = {}) {
  const scopeActivities = activityIds && activityIds.length ? activityIds : knowledge.activities().map((a) => a.id);
  return {
    items: filterByType(itemsForActivities(db, scopeActivities), 'risk'),
    title: 'Reporte de riesgos',
    scope: { activity_ids: activityIds ?? 'todas' },
  };
}
