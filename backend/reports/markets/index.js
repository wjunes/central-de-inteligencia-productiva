// Reporte de mercado (prompt seccion 4.3): mercado como dimensión, no dominio nuevo.
import { itemsForActivities, filterByMarket } from '../select.js';
import { knowledge } from '../../knowledge/loader.js';

export function selectScope(db, { marketId, activityIds }) {
  if (!marketId) throw new Error('reporte de mercado: marketId es obligatorio');
  if (!knowledge.marketDimensions().includes(marketId)) {
    throw new Error(`reporte de mercado: market_id desconocido '${marketId}' (ver domain-names/mercados.json#mercados-destino.market_dimensions)`);
  }
  const scopeActivities = activityIds && activityIds.length ? activityIds : knowledge.activities().map((a) => a.id);
  const items = filterByMarket(itemsForActivities(db, scopeActivities), marketId);
  return {
    items,
    title: `Reporte de mercado — ${marketId}`,
    scope: { market_id: marketId, activity_ids: activityIds ?? null },
  };
}
