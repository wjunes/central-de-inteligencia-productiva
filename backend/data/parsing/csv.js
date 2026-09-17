// parseCsv() - parser CSV genérico (Bloque E), APIs nativas únicamente. NO
// es un parser por institución: no conoce nombres de columnas, instituciones
// ni formatos de fecha - solo interpreta la sintaxis CSV (RFC 4180-like):
// delimitador, campos entrecomillados, comillas escapadas (""), saltos de
// línea dentro de un campo entrecomillado, campos vacíos, CRLF/CR/LF.
//
// Contrato de salida determinístico: { headers: string[], rows: string[][],
// row_count } - primera fila = encabezados, el resto son datos. NUNCA infiere
// tipos (numérico/fecha) ni cuál columna es "la clave" o "el valor": esa
// interpretación depende del monitor curado (ver informe de Bloque E) y este
// parser deliberadamente no la asume.
export function parseCsv(text, { delimiter = ',' } = {}) {
  if (typeof text !== 'string') throw new TypeError('parseCsv: se esperaba una cadena de texto');
  if (delimiter.length !== 1) throw new TypeError('parseCsv: delimiter debe ser un único carácter');

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

  const [headers, ...dataRows] = rows;
  dataRows.forEach((r, idx) => {
    if (r.length !== headers.length) {
      throw new Error(`parseCsv: fila ${idx + 2} tiene ${r.length} campo(s), se esperaban ${headers.length} (segun encabezado) - estructura invalida`);
    }
  });

  return { headers, rows: dataRows, row_count: dataRows.length };
}
