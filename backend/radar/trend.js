// Deteccion de tendencia para el Radar. Reusa TEXTUALMENTE la regla ya
// definida en knowledge/signals/rules.json (regla 'tendencia-por-persistencia':
// >=3 señales cambio-significativo consecutivas, mismo monitor_id + mismo
// indicador, misma direction, sin reversion) - no se inventa un detector
// nuevo, se aplica sobre signals ya persistidas (prompt seccion 9).
//
// El Radar NO crea un intelligence unit type=trend (esta version del motor
// central todavia no genera ese tipo - ver knowledge/intelligence/rules.json:
// trend_precondition). Se limita a anotar, sobre datos ya existentes, si la
// evidencia disponible alcanza para hablar de tendencia o no.
const MIN_STREAK = 3;

function indicatorKeyOf(signal) {
  return `${signal.monitor_id}::${signal.origin_ramification_id ?? signal.origin_activity_id ?? 'na'}`;
}

// Analiza TODAS las señales cambio-significativo de un indicador (monitor_id +
// origin_ramification_id), no solo las de la situación actual - una tendencia
// es una propiedad del indicador a lo largo del tiempo, no de una agrupación puntual.
function trendForIndicator(db, monitorId, ramificationOrActivityId) {
  const rows = db
    .prepare(
      `SELECT * FROM signals WHERE monitor_id = ? AND signal_type = 'cambio-significativo'
       AND (origin_ramification_id = ? OR (origin_ramification_id IS NULL AND origin_activity_id = ?))
       ORDER BY detected_at ASC`
    )
    .all(monitorId, ramificationOrActivityId, ramificationOrActivityId);

  if (rows.length < MIN_STREAK) {
    return { status: 'insufficient_evidence', reason: `${rows.length} observación(es) - se requieren ${MIN_STREAK} (knowledge/signals/rules.json:tendencia-por-persistencia)`, evidence: rows.map((r) => r.id) };
  }

  // racha final (sin reversion) del mismo direction
  let streak = [rows[rows.length - 1]];
  for (let i = rows.length - 2; i >= 0; i--) {
    if (rows[i].direction === streak[0].direction) streak.unshift(rows[i]);
    else break;
  }

  if (streak.length >= MIN_STREAK) {
    return { status: 'confirmed', direction: streak[0].direction, evidence: streak.map((r) => r.id), observations: streak.length };
  }
  return { status: 'insufficient_evidence', reason: `racha actual de ${streak.length} sin reversión, se requieren ${MIN_STREAK}`, evidence: streak.map((r) => r.id) };
}

// detectTrend(): dado un conjunto de signal_ids (los que sustentan una
// situación del Radar), determina si alguno de sus indicadores subyacentes
// alcanza evidencia de tendencia. Nunca fabrica una tendencia a partir de
// una sola observación (Caso 3); sí la reconoce cuando 3+ observaciones
// consecutivas cumplen la regla ya existente (Caso 4).
export function detectTrend(db, signalIds) {
  if (!signalIds.length) return { status: 'insufficient_evidence', reason: 'sin señales', evidence: [] };

  const signals = signalIds.map((id) => db.prepare('SELECT * FROM signals WHERE id = ?').get(id)).filter(Boolean);
  const indicatorKeys = new Map();
  for (const s of signals) {
    const key = indicatorKeyOf(s);
    if (!indicatorKeys.has(key)) indicatorKeys.set(key, s);
  }

  let best = { status: 'insufficient_evidence', reason: 'ningún indicador subyacente alcanza evidencia suficiente', evidence: [] };
  for (const s of indicatorKeys.values()) {
    const result = trendForIndicator(db, s.monitor_id, s.origin_ramification_id ?? s.origin_activity_id);
    if (result.status === 'confirmed') return result; // primera tendencia confirmada encontrada es suficiente
    if (result.evidence.length > best.evidence.length) best = result;
  }
  return best;
}
