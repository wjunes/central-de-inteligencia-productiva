// Reporte periódico (prompt seccion 4.7): compara PERÍODO ACTUAL vs período
// anterior de igual duración. Una comparación NUNCA se presenta como
// tendencia (esa palabra está reservada a radar/trend.js con su propia regla).
// Nueva carpeta (no estaba en el scaffold original).
import { knowledge } from '../../knowledge/loader.js';

function lastChangeInPeriod(db, monitorId, field, fromIso, toIso) {
  return db
    .prepare(
      `SELECT * FROM changes WHERE monitor_id = ? AND field = ? AND change_class = 'valor_modificado' AND detected_at >= ? AND detected_at < ? ORDER BY detected_at DESC LIMIT 1`
    )
    .get(monitorId, field, fromIso, toIso);
}

export function selectScope(db, { monitorId, field, periodStart, periodEnd, activityId }) {
  if (!monitorId || !field || !periodStart || !periodEnd) {
    throw new Error('reporte periódico: monitorId, field, periodStart y periodEnd son obligatorios');
  }
  const durationMs = new Date(periodEnd).getTime() - new Date(periodStart).getTime();
  if (durationMs <= 0) throw new Error('reporte periódico: periodEnd debe ser posterior a periodStart');
  const previousStart = new Date(new Date(periodStart).getTime() - durationMs).toISOString();

  const currentChange = lastChangeInPeriod(db, monitorId, field, periodStart, periodEnd);
  const previousChange = lastChangeInPeriod(db, monitorId, field, previousStart, periodStart);

  const monitor = knowledge.monitorById(monitorId);
  return {
    currentChange,
    previousChange,
    activityId: activityId ?? null,
    topicId: field,
    title: `Reporte periódico — ${monitor?.resource_name ?? monitorId} (${field})`,
    scope: { monitor_id: monitorId, field, period_start: periodStart, period_end: periodEnd, previous_period_start: previousStart },
  };
}
