// extractValue() - Bloque L: convierte una captura normalized.kind='csv_table'
// (backend/data/parsing/csv.js, via adapters.js#fileDownload) en la forma
// {kind:'indicator', indicator, value} que change-detection.js#valueComparison()
// YA sabe leer (mismo contrato usado hoy por ckan_api/api_rest_json) - no se
// modifica change-detection.js ni signals.js: este modulo solo produce la
// forma que esas funciones ya esperaban.
//
// Generico y reutilizable para CUALQUIER csv_table + value_field, sin
// conocer institucion ni monitor: toda la semantica (que columna es "el
// valor" y, si hace falta, como interpretar su formato numerico) viene
// exclusivamente de monitor.monitoring_definition (curado por evidencia
// real) - no hay ningun "if (monitor.id === ...)".
//
// value_field NO significa "tomar la primera fila" ni "la ultima": si el
// csv_table tiene mas de una fila, value_field por si solo es AMBIGUO (no
// identifica de forma inequivoca cual fila es "el valor" a comparar) y la
// extraccion falla de forma explicita en vez de adivinar una posicion. Solo
// cuando el csv_table tiene EXACTAMENTE una fila de datos la extraccion es
// inequivoca sin configuracion adicional.
export class ScalarExtractionError extends Error {}

// applicable(): true solo si HAY algo que este modulo pueda/deba hacer -
// mismo criterio minimalista que tabular.js#isApplicable (solo mira la
// forma del dato + la configuracion curada, nunca el metodo declarado, para
// mantener un unico punto de verdad: si un monitor declara value_field,
// este modulo se activa).
export function isApplicable(normalized, monitor) {
  const valueField = monitor?.monitoring_definition?.value_field;
  return normalized?.kind === 'csv_table' && typeof valueField === 'string' && valueField.length > 0;
}

// parseLocalizedNumber(): conversion numerica generica y EXPLICITA - nunca
// una heuristica universal. El formato (separador decimal / de miles) debe
// venir declarado en monitoring_definition.number_format; sin esa
// declaracion se asume el formato ya parseable por JS ("1234", "1234.56":
// '.' decimal, sin separador de miles) - el mismo default que Number()
// esperaria, no una adivinanza nueva.
export function parseLocalizedNumber(raw, numberFormat = {}) {
  // decimal_separator=null declarado explicitamente significa "este dato
  // jamas usa separador decimal" (ver dgi::principal: 534 valores reales,
  // 0 con parte decimal) - se valida el conflicto contra el valor
  // EXPLICITO declarado (antes de aplicar el default), para no confundir
  // "no declarado" con "declarado igual a '.'":  con thousands_separator='.'
  // y decimal_separator=null no hay ningun conflicto real.
  const declaredDecimalSeparator = numberFormat.decimal_separator;
  const thousandsSeparator = numberFormat.thousands_separator ?? null;
  if (thousandsSeparator != null && declaredDecimalSeparator != null && declaredDecimalSeparator === thousandsSeparator) {
    throw new ScalarExtractionError(`parseLocalizedNumber: configuracion invalida - decimal_separator y thousands_separator son el mismo caracter ('${declaredDecimalSeparator}')`);
  }
  const decimalSeparator = declaredDecimalSeparator ?? '.';
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ScalarExtractionError(`parseLocalizedNumber: valor vacio o no es una cadena (${JSON.stringify(raw)})`);
  }
  let normalized = raw.trim();
  if (thousandsSeparator) {
    normalized = normalized.split(thousandsSeparator).join('');
  }
  if (decimalSeparator !== '.') {
    normalized = normalized.split(decimalSeparator).join('.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new ScalarExtractionError(
      `parseLocalizedNumber: valor no numerico segun el formato declarado ('${raw}' con decimal_separator='${decimalSeparator}'${thousandsSeparator ? `, thousands_separator='${thousandsSeparator}'` : ''})`
    );
  }
  return Number(normalized);
}

// extractValue(): localiza value_field por NOMBRE EXACTO de columna (nunca
// una busqueda aproximada), exige exactamente una fila de datos (una tabla
// con 0 o 2+ filas es ambigua para un value_comparison sin una dimension de
// seleccion adicional - esa dimension no existe hoy en monitoring_definition
// y este modulo no la inventa, ver informe de Bloque L), y conserva el valor
// original (raw_value) junto al valor convertido.
export function extractValue(normalized, monitor) {
  if (!normalized || normalized.kind !== 'csv_table') {
    throw new ScalarExtractionError('extractValue: se esperaba normalized.kind === "csv_table"');
  }
  const def = monitor?.monitoring_definition ?? {};
  const valueField = def.value_field;
  if (typeof valueField !== 'string' || valueField.length === 0) {
    throw new ScalarExtractionError('extractValue: monitoring_definition.value_field no configurado');
  }

  const { headers, rows } = normalized;
  const columnIndex = headers.indexOf(valueField);
  if (columnIndex === -1) {
    throw new ScalarExtractionError(`extractValue: value_field '${valueField}' no existe en el CSV real (encabezados reales: ${headers.join(', ')})`);
  }

  if (rows.length === 0) {
    throw new ScalarExtractionError(`extractValue: el csv_table no tiene filas de datos - no hay valor para '${valueField}'`);
  }
  if (rows.length > 1) {
    throw new ScalarExtractionError(
      `extractValue: el csv_table tiene ${rows.length} filas - value_field '${valueField}' por si solo no identifica un unico valor comparable (value_comparison requiere exactamente 1). Falta una dimension de seleccion declarada en monitoring_definition (ej. una columna + criterio para elegir una fila entre ${rows.length} candidatas) - no se inventa una selección de fila.`
    );
  }

  const rawValue = rows[0][columnIndex];
  if (rawValue === '' || rawValue == null) {
    throw new ScalarExtractionError(`extractValue: valor vacio para '${valueField}' en la unica fila de datos`);
  }

  const value = parseLocalizedNumber(rawValue, def.number_format ?? {});

  return { kind: 'indicator', indicator: valueField, value, raw_value: rawValue };
}
