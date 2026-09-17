// parseCsv() - parser CSV genérico (Bloque E, ampliado en Bloque J), APIs
// nativas únicamente. NO es un parser por institución: no conoce nombres de
// columnas, instituciones ni formatos de fecha - solo interpreta la sintaxis
// CSV (RFC 4180-like): delimitador, campos entrecomillados, comillas
// escapadas (""), saltos de línea dentro de un campo entrecomillado, campos
// vacíos, CRLF/CR/LF.
//
// Contrato de salida determinístico: { headers: string[], rows: string[][],
// row_count } - la fila headerRow (ver más abajo) son los encabezados, el
// resto son datos. NUNCA infiere tipos (numérico/fecha) ni cuál columna es
// "la clave" o "el valor": esa interpretación depende del monitor curado
// (ver informe de Bloque E/F) y este parser deliberadamente no la asume.
//
// headerRow (Bloque J): índice 0-BASED de la fila de encabezados dentro del
// archivo completo (0 = primera línea del archivo, sin excepción). Toda fila
// ANTERIOR a headerRow es preámbulo y se descarta sin validar su cantidad de
// campos (un preámbulo real, ej. DGI, casi nunca tiene el mismo número de
// columnas que la tabla de datos - exigirle esa forma sería inventar una
// regla que el archivo no cumple). Solo las filas DESPUÉS de headerRow se
// validan contra headers.length. La fuente de este valor es exclusivamente
// monitor.monitoring_definition.header_row (knowledge/monitoring/
// monitors.json, curado por evidencia real) - nunca una heurística de
// contenido ("buscar la fila que parezca encabezado") ni de institución.
export function parseCsv(text, { delimiter = ',', headerRow = 0 } = {}) {
  if (typeof text !== 'string') throw new TypeError('parseCsv: se esperaba una cadena de texto');
  if (delimiter.length !== 1) throw new TypeError('parseCsv: delimiter debe ser un único carácter');
  if (!Number.isInteger(headerRow) || headerRow < 0) {
    throw new Error(`parseCsv: header_row invalido (${headerRow}) - debe ser un entero >= 0 (0 = primera linea del archivo)`);
  }

  const QUOTE = '"';
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === QUOTE) {
        if (text[i + 1] === QUOTE) { field += QUOTE; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }

    if (c === QUOTE && field === '') { inQuotes = true; i += 1; continue; }
    if (c === delimiter) { pushField(); i += 1; continue; }
    if (c === '\r') { if (text[i + 1] === '\n') i += 1; pushRow(); i += 1; continue; }
    if (c === '\n') { pushRow(); i += 1; continue; }

    field += c; i += 1;
  }

  if (inQuotes) throw new Error('parseCsv: comilla sin cerrar - estructura invalida');
  if (field !== '' || row.length > 0) pushRow();

  // Una unica linea en blanco al final (artefacto comun de salto de linea
  // final) no es un error estructural - se descarta antes de validar
  // longitud de fila. Una linea en blanco en MEDIO del archivo sigue
  // tratandose como estructura invalida (longitud de fila no coincide).
  if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  if (!rows.length) throw new Error('parseCsv: contenido vacio o sin filas');
  if (headerRow >= rows.length) {
    throw new Error(`parseCsv: header_row (${headerRow}) fuera de rango - el archivo tiene ${rows.length} fila(s) en total`);
  }

  const headers = rows[headerRow];
  const dataRows = rows.slice(headerRow + 1);
  dataRows.forEach((r, idx) => {
    if (r.length !== headers.length) {
      throw new Error(`parseCsv: fila ${headerRow + idx + 2} tiene ${r.length} campo(s), se esperaban ${headers.length} (segun encabezado en fila ${headerRow + 1}) - estructura invalida`);
    }
  });

  return { headers, rows: dataRows, row_count: dataRows.length };
}

// decodeBytes() - decodifica bytes crudos (Buffer/Uint8Array) segun un
// encoding declarado, usando TextDecoder nativo (WHATWG Encoding Standard -
// disponible en Node sin dependencias npm, Node embebe ICU completo). Con
// fatal:true, CUALQUIER secuencia de bytes invalida para el encoding
// declarado lanza un error explicito en vez de sustituirla silenciosamente
// por el caracter de reemplazo (U+FFFD) - un archivo decodificado con el
// encoding equivocado debe fallar de forma visible, no producir texto basura
// que parezca valido. Un encoding no soportado (nombre invalido) tambien es
// un error explicito (TextDecoder lanza RangeError), nunca un fallback
// silencioso a UTF-8.
export function decodeBytes(buffer, encoding = 'utf-8') {
  let decoder;
  try {
    decoder = new TextDecoder(encoding, { fatal: true });
  } catch (err) {
    if (err instanceof RangeError) throw new Error(`decodeBytes: encoding no soportado: '${encoding}'`);
    throw err;
  }
  try {
    return decoder.decode(buffer);
  } catch (err) {
    throw new Error(`decodeBytes: contenido invalido para el encoding declarado '${encoding}' - ${err.message}`);
  }
}

// parseCsvBuffer() - combina decodeBytes() + parseCsv() para el caso real de
// adapters.js#fileDownload(): bytes crudos + configuracion curada por
// monitor (delimiter/encoding/header_row, ver knowledge/monitoring/
// monitors.json#monitoring_definition). No agrega ninguna regla nueva -
// solo evita que cada llamador repita el orden decode->parse.
export function parseCsvBuffer(buffer, { delimiter = ',', encoding = 'utf-8', headerRow = 0 } = {}) {
  const text = decodeBytes(buffer, encoding);
  return parseCsv(text, { delimiter, headerRow });
}
