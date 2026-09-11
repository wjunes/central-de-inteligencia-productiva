// Reporte de oportunidades (prompt seccion 4.5), simétrico a risks/.
import { itemsForActivities, filterByType } from '../select.js';
import { knowledge } from '../../knowledge/loader.js';

export function selectScope(db, { activityIds } = {}) {
  const scopeActivities = activityIds && activityIds.length ? activityIds : knowledge.activities().map((a) => a.id);
  return {
    items: filterByType(itemsForActivities(db, scopeActivities), 'opportunity'),
    title: 'Reporte de oportunidades',
    scope: { activity_ids: activityIds ?? 'todas' },
  };
}
