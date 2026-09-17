// select() - Bloque N: reduce un csv_table de N filas a EXACTAMENTE 1 fila,
// segun una declaracion de seleccion curada por evidencia real
// (monitor.monitoring_definition.selection - ver knowledge/monitoring/
// monitors.json#dgi::principal, curado en Bloque M). Se ejecuta ANTES de
// data/normalization/scalar.js#extractValue() (que ya exige exactamente 1
// fila desde Bloque L) - extractValue() no sabe nada de estrategias
// temporales, este modulo tampoco sabe nada de "value_field"/conversion
// numerica: cada uno resuelve una unica responsabilidad.
//
// Generico y reutilizable para CUALQUIER csv_table + selection, sin conocer
// institucion ni monitor - no hay ningun "if (monitor.id === ...)". Si un
// monitor no declara selection, este modulo simplemente no se activa
// (isApplicable() devuelve false) y el comportamiento existente (Bloque L)
// permanece intacto.
export class SelectionError extends Error {}

// MONTHS: abreviaturas en espanol observadas en datos reales (Bloque M,
// dgi::principal) - 'sep' se agrega ademas de 'set' porque ambas son formas
// validas de abreviar septiembre en espanol, aunque solo 'set' aparece hoy
// en el archivo real. Claves en minuscula: la comparacion siempre normaliza
// el mes a minuscula antes de esta lookup (case-insensitive).
const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

// parseCalendarPeriod(): interpreta EXCLUSIVAMENTE el formato "Mmm-YYYY" (el
// unico formato real verificado, ver Bloque M) - devuelve null (no lanza) si
// el valor no calza, para que el llamador arme un mensaje de error con
// contexto (numero de fila) en vez de un stack trace generico.
function parseCalendarPeriod(raw) {
  if (typeof raw !== 'string') return null;
  const match = /^([A-Za-z]{3})-(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  const year = Number(match[2]);
  return { year, month, sortKey: year * 12 + month };
}

// latestPeriodStrategy(): compara TODAS las filas por el VALOR calendario de
// su periodo (year*12+mes), nunca por posicion fisica en el archivo - un
// archivo desordenado produce exactamente el mismo resultado (ver tests).
// Cualquier fila con un periodo no interpretable aborta toda la seleccion
// (no se descarta silenciosamente una fila "rara" y se sigue con las demas):
// mismo principio de "no aceptar silenciosamente" ya aplicado en
// tabular.js/scalar.js.
function latestPeriodStrategy(rows, fieldIndex, fieldName) {
  if (rows.length === 0) {
    throw new SelectionError(`select: no hay filas de datos para aplicar la estrategia 'latest_period' sobre '${fieldName}'`);
  }
  const parsed = rows.map((row, i) => {
    const raw = row[fieldIndex];
    const period = parseCalendarPeriod(raw);
    if (!period) {
      throw new SelectionError(
        `select: valor de periodo invalido en la fila ${i + 1} para '${fieldName}': ${JSON.stringify(raw)} (formato esperado: 'Mmm-YYYY', meses en espanol abreviados, case-insensitive - ver knowledge/monitoring/monitors.json#selection.period_format)`
      );
    }
    return { index: i, period };
  });
  const maxSortKey = Math.max(...parsed.map((p) => p.period.sortKey));
  const winners = parsed.filter((p) => p.period.sortKey === maxSortKey);
  if (winners.length > 1) {
    throw new SelectionError(
      `select: el periodo maximo para '${fieldName}' no es univoco - ${winners.length} filas comparten el mismo periodo mas reciente (filas: ${winners.map((w) => w.index + 1).join(', ')}). No se elige una arbitrariamente entre ellas.`
    );
  }
  return winners[0].index;
}

const STRATEGIES = { latest_period: latestPeriodStrategy };

// isApplicable(): mismo criterio minimalista que tabular.js/scalar.js - solo
// mira la forma del dato (kind=csv_table) + la configuracion curada
// (selection.field/selection.strategy declarados). Si selection no existe,
// devuelve false y el llamador (orchestrator.js) no aplica ningun cambio -
// el comportamiento de Bloque L queda intacto para cualquier monitor sin
// selection declarada.
export function isApplicable(normalized, monitor) {
  const selection = monitor?.monitoring_definition?.selection;
  return (
    normalized?.kind === 'csv_table' &&
    typeof selection?.field === 'string' &&
    selection.field.length > 0 &&
    typeof selection?.strategy === 'string' &&
    selection.strategy.length > 0
  );
}

// select(): localiza selection.field por NOMBRE EXACTO de columna (nunca una
// busqueda aproximada ni una heuristica de "columna que parece una fecha"),
// aplica la estrategia declarada, y devuelve un NUEVO csv_table con
// exactamente 1 fila - la fila devuelta conserva TODOS sus valores
// originales sin alterar (mismos headers, misma fila completa, no solo el
// campo de seleccion).
export function select(normalized, selection) {
  if (!normalized || normalized.kind !== 'csv_table') {
    throw new SelectionError('select: se esperaba normalized.kind === "csv_table"');
  }
  const field = selection?.field;
  if (typeof field !== 'string' || field.length === 0) {
    throw new SelectionError('select: selection.field no configurado');
  }
  const strategy = selection?.strategy;
  const strategyFn = STRATEGIES[strategy];
  if (!strategyFn) {
    throw new SelectionError(`select: estrategia de seleccion no soportada: '${strategy}' (soportadas: ${Object.keys(STRATEGIES).join(', ')})`);
  }

  const { headers, rows } = normalized;
  const fieldIndex = headers.indexOf(field);
  if (fieldIndex === -1) {
    throw new SelectionError(`select: selection.field '${field}' no existe en el CSV real (encabezados reales: ${headers.join(', ')})`);
  }

  const selectedIndex = strategyFn(rows, fieldIndex, field);
  const selectedRow = rows[selectedIndex];

  return { kind: 'csv_table', headers, rows: [selectedRow], row_count: 1 };
}
