// Bloque E - parser CSV genérico. Pruebas puras (sin red, sin DB) sobre
// backend/data/parsing/csv.js - cubre los 7 casos pedidos (simple, campos
// entrecomillados, comillas escapadas, campos vacios, delimitador
// alternativo, UTF-8, CSV invalido).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, decodeBytes, parseCsvBuffer } from '../data/parsing/csv.js';

describe('Bloque E - parseCsv()', () => {
  test('Caso 1 - CSV simple: encabezados + filas', () => {
    const result = parseCsv('a,b,c\n1,2,3\n4,5,6\n');
    assert.deepEqual(result.headers, ['a', 'b', 'c']);
    assert.deepEqual(result.rows, [['1', '2', '3'], ['4', '5', '6']]);
    assert.equal(result.row_count, 2);
  });

  test('Caso 2 - campos entrecomillados (incluye delimitador y salto de linea dentro de comillas)', () => {
    const result = parseCsv('nombre,nota\n"Perez, Juan","primera linea\nsegunda linea"\n');
    assert.deepEqual(result.headers, ['nombre', 'nota']);
    assert.deepEqual(result.rows, [['Perez, Juan', 'primera linea\nsegunda linea']]);
  });

  test('Caso 3 - comillas escapadas ("") dentro de un campo entrecomillado', () => {
    const result = parseCsv('frase\n"dijo ""hola"" y se fue"\n');
    assert.deepEqual(result.rows, [['dijo "hola" y se fue']]);
  });

  test('Caso 4 - campos vacios (consecutivos, al inicio, al final)', () => {
    const result = parseCsv('a,b,c,d\n,,x,\n');
    assert.deepEqual(result.rows, [['', '', 'x', '']]);
  });

  test('Caso 5 - delimitador alternativo (punto y coma)', () => {
    const result = parseCsv('a;b;c\n1;2;3\n', { delimiter: ';' });
    assert.deepEqual(result.headers, ['a', 'b', 'c']);
    assert.deepEqual(result.rows, [['1', '2', '3']]);
  });

  test('Caso 6 - UTF-8 (acentos, ñ, símbolos multibyte preservados tal cual)', () => {
    const result = parseCsv('AÑO,región\n2026,"Montevideo — Ñandú"\n');
    assert.deepEqual(result.headers, ['AÑO', 'región']);
    assert.deepEqual(result.rows, [['2026', 'Montevideo — Ñandú']]);
  });

  test('Caso 7a - CSV invalido: comilla sin cerrar', () => {
    assert.throws(() => parseCsv('a,b\n"sin cerrar,x\n'), /comilla sin cerrar/);
  });

  test('Caso 7b - CSV invalido: fila con distinta cantidad de campos que el encabezado', () => {
    assert.throws(() => parseCsv('a,b,c\n1,2\n'), /estructura invalida/);
  });

  test('Caso 7c - CSV invalido: contenido vacio', () => {
    assert.throws(() => parseCsv(''), /vacio/);
  });

  test('Extra - CRLF (\\r\\n) tratado igual que LF', () => {
    const result = parseCsv('a,b\r\n1,2\r\n3,4\r\n');
    assert.deepEqual(result.rows, [['1', '2'], ['3', '4']]);
  });

  test('Extra - encabezados sin filas de datos (no es un error)', () => {
    const result = parseCsv('a,b,c\n');
    assert.deepEqual(result.headers, ['a', 'b', 'c']);
    assert.deepEqual(result.rows, []);
    assert.equal(result.row_count, 0);
  });

  test('Extra - linea en blanco final unica se descarta, no cuenta como fila invalida', () => {
    const result = parseCsv('a,b\n1,2\n\n');
    assert.deepEqual(result.rows, [['1', '2']]);
  });

  test('Extra - sin salto de linea final (ultima fila igualmente valida)', () => {
    const result = parseCsv('a,b\n1,2');
    assert.deepEqual(result.rows, [['1', '2']]);
  });
});

describe('Bloque J - parser CSV configurable (delimiter + encoding + header_row)', () => {
  test('1 - CSV UTF-8 sin header_row explicito: comportamiento identico a Bloque E (default header_row=0)', () => {
    const result = parseCsv('a,b,c\n1,2,3\n4,5,6\n');
    assert.deepEqual(result.headers, ['a', 'b', 'c']);
    assert.deepEqual(result.rows, [['1', '2', '3'], ['4', '5', '6']]);
  });

  test('2 - CSV separado por ; sigue funcionando exactamente igual (ya cubierto en Bloque E, Caso 5) y no rompe el default de coma', () => {
    const bySemicolon = parseCsv('a;b;c\n1;2;3\n', { delimiter: ';' });
    assert.deepEqual(bySemicolon.rows, [['1', '2', '3']]);
    const byComma = parseCsv('a,b,c\n1,2,3\n');
    assert.deepEqual(byComma.rows, [['1', '2', '3']]);
  });

  test('3 - coma decimal con delimitador ";": el parser no confunde la coma decimal con el delimitador', () => {
    const result = parseCsv('producto;precio\nGas Oil;0,00\nGLP;1234,56\n', { delimiter: ';' });
    assert.deepEqual(result.headers, ['producto', 'precio']);
    assert.deepEqual(result.rows, [['Gas Oil', '0,00'], ['GLP', '1234,56']], 'la coma decimal debe preservarse intacta dentro del campo, no dividirlo');
  });

  test('4 - CSV Windows-1252 con caracteres reales (á é í ó ú ñ ü €) decodificado correctamente', () => {
    // Bytes windows-1252 reales para "áéíóú" + ";" + "ñü€" (verificados con
    // TextDecoder nativo, no una tabla inventada - ver decodeBytes()).
    const buffer = Buffer.concat([
      Buffer.from('campo1;campo2\n', 'latin1'),
      Buffer.from([0xe1, 0xe9, 0xed, 0xf3, 0xfa]),
      Buffer.from(';', 'latin1'),
      Buffer.from([0xf1, 0xfc, 0x80]),
      Buffer.from('\n', 'latin1'),
    ]);
    const decoded = decodeBytes(buffer, 'windows-1252');
    assert.equal(decoded, 'campo1;campo2\náéíóú;ñü€\n');
    const result = parseCsvBuffer(buffer, { delimiter: ';', encoding: 'windows-1252' });
    assert.deepEqual(result.headers, ['campo1', 'campo2']);
    assert.deepEqual(result.rows, [['áéíóú', 'ñü€']]);
  });

  test('5 - CSV con filas preliminares antes del header (header_row > 0), delimitador por defecto', () => {
    const text = 'preambulo linea 1\npreambulo linea 2\nid,nombre\n1,Ana\n2,Beto\n';
    const result = parseCsv(text, { headerRow: 2 });
    assert.deepEqual(result.headers, ['id', 'nombre']);
    assert.deepEqual(result.rows, [['1', 'Ana'], ['2', 'Beto']]);
    assert.equal(result.row_count, 2);
  });

  test('6 - combinacion real (forma de dgi::principal): Windows-1252 + ";" + header_row=13 (13 filas de preambulo)', () => {
    const preambleLines = Array.from({ length: 13 }, () => ';;;;;;').join('\n') + '\n';
    const headerLine = ';;;Fecha;Importe;;\n';
    const dataLines = ';;1982;Ene-1982;1.263.321;;\n;;1982;Feb-1982;1.343.634;;\n';
    // 'RECAUDACIÓN' iría en el preambulo real (con 0xD3 = 'Ó' en windows-1252)
    // - aqui basta con demostrar que decode+delimiter+header_row combinados
    // funcionan; el caracter especial ya esta cubierto por el Caso 4.
    const buffer = Buffer.from(preambleLines + headerLine + dataLines, 'latin1');
    const result = parseCsvBuffer(buffer, { delimiter: ';', encoding: 'windows-1252', headerRow: 13 });
    assert.deepEqual(result.headers, ['', '', '', 'Fecha', 'Importe', '', '']);
    assert.deepEqual(result.rows, [
      ['', '', '1982', 'Ene-1982', '1.263.321', '', ''],
      ['', '', '1982', 'Feb-1982', '1.343.634', '', ''],
    ]);
    assert.equal(result.row_count, 2);
  });

  test('7 - header_row invalido: negativo, no entero, o fuera de rango -> error explicito y controlado', () => {
    assert.throws(() => parseCsv('a,b\n1,2\n', { headerRow: -1 }), /header_row invalido/);
    assert.throws(() => parseCsv('a,b\n1,2\n', { headerRow: 1.5 }), /header_row invalido/);
    assert.throws(() => parseCsv('a,b\n1,2\n', { headerRow: 5 }), /header_row \(5\) fuera de rango/);
  });

  test('8 - encoding no soportado -> error explicito, nunca un fallback silencioso a UTF-8', () => {
    assert.throws(() => decodeBytes(Buffer.from('a,b\n1,2\n'), 'no-existe-este-encoding'), /encoding no soportado/);
    assert.throws(() => parseCsvBuffer(Buffer.from('a,b\n1,2\n'), { encoding: 'no-existe-este-encoding' }), /encoding no soportado/);
  });

  test('8b - contenido invalido para el encoding declarado -> error explicito, nunca reemplazo silencioso de caracteres (U+FFFD)', () => {
    // 0xE1 solo (sin continuacion) es una secuencia UTF-8 invalida - con
    // fatal:true debe fallar, no sustituirse silenciosamente por U+FFFD.
    const invalidUtf8 = Buffer.from([0x61, 0xe1, 0x62]);
    assert.throws(() => decodeBytes(invalidUtf8, 'utf-8'), /contenido invalido para el encoding declarado/);
  });

  test('9 - archivo estructuralmente invalido con header_row > 0: una fila de DATOS (no de preambulo) con distinta cantidad de campos sigue siendo error', () => {
    const text = 'preambulo\nid,nombre,edad\n1,Ana,30\n2,Beto\n';
    assert.throws(() => parseCsv(text, { headerRow: 1 }), /estructura invalida/, 'las filas de preambulo (antes de headerRow) NO se validan, pero las de datos (despues) si');
  });

  test('9b - las filas de preambulo NO se validan por cantidad de campos (forma arbitraria, distinta de la tabla real)', () => {
    // El preambulo tiene 1 solo campo por linea (sin delimitador), muy
    // distinto de las 2 columnas reales de la tabla - no debe lanzar error.
    const text = 'PREAMBULO SIN DELIMITADOR\nid,nombre\n1,Ana\n';
    const result = parseCsv(text, { headerRow: 1 });
    assert.deepEqual(result.headers, ['id', 'nombre']);
    assert.deepEqual(result.rows, [['1', 'Ana']]);
  });
});
