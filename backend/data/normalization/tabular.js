// toRecords() - Bloque G: convierte una captura normalized.kind='csv_table'
// (backend/data/parsing/csv.js, vía adapters.js#fileDownload) en la
// estructura { records: [{key, ...columnas}] } que YA consume
// data/updates/change-detection.js#recordDiff() sin ningun cambio (no se
// reimplementa esa comparacion aqui - ver comentario mas abajo).
//
// Generico y reutilizable para CUALQUIER csv_table + record_key, sin
// conocer institucion ni monitor: toda la semantica (que columnas forman la
// clave) viene exclusivamente de monitor.change_detection.record_key
// (curado en Bloque F/G, ver knowledge/monitoring/monitors.json). No hay
// ningun "if (monitor.id === ...)" - si dos monitores distintos declaran el
// mismo record_key sobre CSVs con las mismas columnas, se comportan igual.
//
// Tipos: los valores de columna se preservan EXACTAMENTE como los entrego
// el parser CSV (string, incluyendo cadena vacia) - no se intenta adivinar
// numero/fecha/booleano. Es la unica forma determinista de "mantener tipos
// de forma segura" sin inventar una regla de coercion que ningun monitor
// pidio (ej. "0,00" vs "0.00" son formatos de decimal distintos entre
// fuentes - convertir mal seria peor que no convertir).
export class TabularNormalizationError extends Error {}

// applicable(): true solo si HAY algo que este modulo pueda/deba hacer -
// nunca se activa para un csv_table sin record_key curado (mgap-snig/dgi
// siguen sin tocarse en este bloque: no tienen change_detection.record_key).
export function isApplicable(normalized, monitor) {
  return normalized?.kind === 'csv_table' && Array.isArray(monitor?.change_detection?.record_key) && monitor.change_detection.record_key.length > 0;
}

export function toRecords(normalized, recordKey) {
  if (!normalized || normalized.kind !== 'csv_table') {
    throw new TabularNormalizationError('toRecords: se esperaba normalized.kind === "csv_table"');
  }
  if (!Array.isArray(recordKey) || recordKey.length === 0) {
    throw new TabularNormalizationError('toRecords: record_key vacio o ausente - no se construye una clave por defecto con todas las columnas');
  }

  const { headers, rows } = normalized;
  const keyIndexes = recordKey.map((col) => headers.indexOf(col));
  const missingCols = recordKey.filter((_, i) => keyIndexes[i] === -1);
  if (missingCols.length) {
    throw new TabularNormalizationError(`toRecords: record_key referencia columna(s) inexistente(s) en el CSV real: ${missingCols.join(', ')} (encabezados reales: ${headers.join(', ')})`);
  }

  const seenKeys = new Set();
  const records = rows.map((row, rowIndex) => {
    const keyParts = keyIndexes.map((i) => row[i]);
    if (keyParts.some((v) => v === '' || v == null)) {
      throw new TabularNormalizationError(`toRecords: fila ${rowIndex + 1} tiene un valor vacio en una columna de record_key (${recordKey.join(', ')}) - clave incompleta, no se identifica de forma determinista`);
    }
    const key = keyParts.join('|');
    if (seenKeys.has(key)) {
      throw new TabularNormalizationError(`toRecords: clave duplicada '${key}' en fila ${rowIndex + 1} - record_key no identifica registros de forma unica en los datos reales`);
    }
    seenKeys.add(key);

    const fields = {};
    headers.forEach((h, i) => { fields[h] = row[i]; });
    return { key, ...fields };
  });

  return { kind: 'csv_table', records };
}

// persistNormalized(): capture.js#acquire() ya escribió captures.normalized_data
// con la forma CRUDA del adaptador (csv_table) al momento de adquirir - eso
// es lo que lastCaptureBefore()/detectChanges() leerán como "prev" en la
// PRÓXIMA corrida. Si no se re-escribe con la forma transformada ({records}),
// la próxima comparación vería prev.records=undefined siempre (como si nunca
// hubiera captura previa) y jamás detectaría sin_cambio. No se toca
// data/acquisition/capture.js (que sigue sin saber nada de "tablas" ni de
// record_key, tal como pide el diseño de esta etapa): esta es la única
// escritura de base de datos que hace esta capa, acotada a esta columna, y
// solo se ejecuta cuando isApplicable() ya fue verdadero.
export function persistNormalized(db, captureId, normalized) {
  db.prepare('UPDATE captures SET normalized_data = ? WHERE id = ?').run(JSON.stringify(normalized), captureId);
}
