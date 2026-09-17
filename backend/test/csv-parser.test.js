// Bloque E - parser CSV genérico. Pruebas puras (sin red, sin DB) sobre
// backend/data/parsing/csv.js - cubre los 7 casos pedidos (simple, campos
// entrecomillados, comillas escapadas, campos vacios, delimitador
// alternativo, UTF-8, CSV invalido).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../data/parsing/csv.js';

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
