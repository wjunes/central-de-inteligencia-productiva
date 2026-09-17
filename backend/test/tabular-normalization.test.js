// Bloque G - capa de normalizacion tabular (csv_table -> {records:[...]}).
// Pruebas puras sobre backend/data/normalization/tabular.js - sin red, sin
// pipeline completo (la integracion con record_diff/signals vive en
// csv-change-detection.test.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isApplicable, toRecords, TabularNormalizationError } from '../data/normalization/tabular.js';

function csvTable(headers, rows) {
  return { kind: 'csv_table', headers, rows, row_count: rows.length };
}

describe('Bloque G - isApplicable()', () => {
  test('true solo si kind=csv_table Y el monitor tiene change_detection.record_key no vacio', () => {
    const table = csvTable(['a', 'b'], [['1', '2']]);
    assert.equal(isApplicable(table, { change_detection: { record_key: ['a'] } }), true);
    assert.equal(isApplicable(table, { change_detection: { method: 'record_diff' } }), false, 'sin record_key -> no aplicable (mgap-snig/dgi hoy)');
    assert.equal(isApplicable(table, { change_detection: { record_key: [] } }), false, 'record_key vacio -> no aplicable');
    assert.equal(isApplicable({ kind: 'raw_json' }, { change_detection: { record_key: ['a'] } }), false, 'kind distinto de csv_table -> nunca aplicable');
    assert.equal(isApplicable(null, { change_detection: { record_key: ['a'] } }), false);
  });
});

describe('Bloque G - toRecords()', () => {
  test('Caso 1 - csv_table -> records: preserva nombres y valores originales de columnas', () => {
    const table = csvTable(['producto', 'fecha', 'precio'], [['Gas Oil', '2026-01-01', '1000']]);
    const result = toRecords(table, ['producto', 'fecha']);
    assert.deepEqual(result.records, [{ key: 'Gas Oil|2026-01-01', producto: 'Gas Oil', fecha: '2026-01-01', precio: '1000' }]);
  });

  test('Caso 2 - record_key simple (una sola columna)', () => {
    const table = csvTable(['Fecha', 'Trafico'], [['2026-01-31', '100'], ['2026-02-28', '110']]);
    const result = toRecords(table, ['Fecha']);
    assert.deepEqual(result.records.map((r) => r.key), ['2026-01-31', '2026-02-28']);
  });

  test('Caso 3 - record_key compuesto (varias columnas, orden preservado con separador)', () => {
    const table = csvTable(['producto', 'fecha_vigencia', 'valor'], [['A', '2026-01-01', '1'], ['A', '2026-02-01', '2']]);
    const result = toRecords(table, ['producto', 'fecha_vigencia']);
    assert.deepEqual(result.records.map((r) => r.key), ['A|2026-01-01', 'A|2026-02-01']);
  });

  test('Caso 4 - claves ausentes (columna de record_key vacia en una fila) -> error determinista', () => {
    const table = csvTable(['producto', 'fecha'], [['Gas Oil', '']]);
    assert.throws(() => toRecords(table, ['producto', 'fecha']), TabularNormalizationError);
    assert.throws(() => toRecords(table, ['producto', 'fecha']), /clave incompleta/);
  });

  test('Caso 5 - claves duplicadas (misma combinacion de record_key en 2 filas) -> error determinista', () => {
    const table = csvTable(['producto', 'fecha'], [['Gas Oil', '2026-01-01'], ['Gas Oil', '2026-01-01']]);
    assert.throws(() => toRecords(table, ['producto', 'fecha']), /clave duplicada/);
  });

  test('Caso 6 - valores vacios en columnas que NO son parte de record_key: se preservan tal cual, no es error', () => {
    const table = csvTable(['producto', 'fecha', 'observacion'], [['Gas Oil', '2026-01-01', '']]);
    const result = toRecords(table, ['producto', 'fecha']);
    assert.equal(result.records[0].observacion, '');
  });

  test('Caso 7 - strings con caracteres especiales (comillas, comas, acentos, saltos de linea ya resueltos por el parser CSV) se preservan sin alterar', () => {
    const table = csvTable(['producto', 'fecha', 'nota'], [['Gasolina Súper 95', '2026-01-01', 'línea uno\nlínea "dos", con coma']]);
    const result = toRecords(table, ['producto', 'fecha']);
    assert.equal(result.records[0].producto, 'Gasolina Súper 95');
    assert.equal(result.records[0].nota, 'línea uno\nlínea "dos", con coma');
  });

  test('Caso 8 - tabla vacia (0 filas de datos) -> records: [], no es un error', () => {
    const table = csvTable(['producto', 'fecha'], []);
    const result = toRecords(table, ['producto', 'fecha']);
    assert.deepEqual(result.records, []);
  });

  test('record_key ausente o vacio -> error (nunca arma una clave por defecto con todas las columnas)', () => {
    const table = csvTable(['a', 'b'], [['1', '2']]);
    assert.throws(() => toRecords(table, []), /vacio o ausente/);
    assert.throws(() => toRecords(table, undefined), /vacio o ausente/);
  });

  test('record_key referencia una columna que no existe en el CSV real -> error determinista, no se adivina', () => {
    const table = csvTable(['a', 'b'], [['1', '2']]);
    assert.throws(() => toRecords(table, ['a', 'c']), /columna\(s\) inexistente/);
  });

  test('kind distinto de csv_table -> error (no se aplica a otras formas)', () => {
    assert.throws(() => toRecords({ kind: 'raw_json' }, ['a']), /csv_table/);
  });
});

describe('Bloque H4 - re-curación de ursea::precios-paridad-combustibles (H1) - casos 12/13', () => {
  // Reproduce el caso real descubierto en Bloque G/H1: dos cierres distintos
  // de URSEA (2026-07-25 y 2026-08-25) para el mismo producto y la misma
  // fecha_vigencia (2026-08-01) - datos reales, no inventados (ver informe).
  const headers = ['producto', 'fecha_cierre', 'fecha_vigencia', 'total_precio_ex_planta_1'];
  const rows = [
    ['Gas Oil 10S', '2026-07-25', '2026-08-01', '1305.84'],
    ['Gas Oil 10S', '2026-08-25', '2026-08-01', '1476.79'],
  ];

  test('12 - con record_key=[producto,fecha_cierre], el dataset con dos cierres para el mismo producto+fecha_vigencia se acepta (clave única)', () => {
    const table = csvTable(headers, rows);
    const result = toRecords(table, ['producto', 'fecha_cierre']);
    assert.equal(result.records.length, 2);
    assert.deepEqual(result.records.map((r) => r.key), ['Gas Oil 10S|2026-07-25', 'Gas Oil 10S|2026-08-25']);
  });

  test('13 - con record_key=[producto,fecha_vigencia] (la clave curada ANTES de H1), el mismo dataset real vuelve a producir "clave duplicada"', () => {
    const table = csvTable(headers, rows);
    assert.throws(() => toRecords(table, ['producto', 'fecha_vigencia']), /clave duplicada 'Gas Oil 10S\|2026-08-01'/, 'confirma que el problema era la elección de columnas de la clave, no un bug del parser/normalizador');
  });
});

describe('Bloque K - re-curación de mgap-snig::principal (record_key con prefijo real ns1:)', () => {
  // Headers reales verificados en Bloque J/K (curl directo contra
  // datosgenerales.csv): las 15 columnas del archivo real traen el prefijo
  // de namespace XML 'ns1:' - ningun nombre aqui es inventado.
  const headers = [
    'ns1:Ejercicio', 'ns1:DepartamentoCodigo', 'ns1:SeccionalPolicialCodigo', 'ns1:AreaSupervision', 'ns1:AreaEnumeracion',
    'ns1:ActividadCodigo', 'ns1:GiroCodigo', 'ns1:NaturalezaJuridicaCodigo', 'ns1:EstratoCodigo', 'ns1:EspecializacionMGAPCodigo',
    'ns1:TipoProduccionMGAPCodigo', 'ns1:Superficie', 'ns1:UnidadesGanaderas', 'ns1:SuperficieGanadera', 'ns1:CantidadTenedores',
  ];
  const RECORD_KEY_11 = headers.slice(0, 11);

  test('14 - las 11 dimensiones del record_key existen en el header real (ninguna columna inexistente)', () => {
    const table = csvTable(headers, [['2025', '1', '0', '0', '0', '44', '10', '3', '1', '1', '1', '0', '0,00', '0,00', '1']]);
    assert.doesNotThrow(() => toRecords(table, RECORD_KEY_11));
  });

  test('15 - registros con la misma combinación de 11 dimensiones -> clave duplicada (el prefijo no cambia la semántica de unicidad)', () => {
    const table = csvTable(headers, [
      ['2025', '1', '0', '0', '0', '44', '10', '3', '1', '1', '1', '0', '0,00', '0,00', '1'],
      ['2025', '1', '0', '0', '0', '44', '10', '3', '1', '1', '1', '999', '99,99', '99,99', '9'], // mismas 11 dimensiones, solo cambian columnas fuera de la clave
    ]);
    assert.throws(() => toRecords(table, RECORD_KEY_11), /clave duplicada/);
  });

  test('16 - registros con al menos una de las 11 dimensiones distinta -> 0 duplicados, ambos records válidos', () => {
    const table = csvTable(headers, [
      ['2025', '1', '0', '0', '0', '44', '10', '3', '1', '1', '1', '0', '0,00', '0,00', '1'],
      ['2025', '2', '0', '0', '0', '44', '10', '3', '1', '1', '1', '0', '0,00', '0,00', '1'], // DepartamentoCodigo distinto
    ]);
    const result = toRecords(table, RECORD_KEY_11);
    assert.equal(result.records.length, 2);
    assert.notEqual(result.records[0].key, result.records[1].key);
  });

  test('17 - normalización preserva los 15 campos reales (clave + relevantes), sin alterar ni perder valores', () => {
    const table = csvTable(headers, [['2025', '1', '0', '0', '0', '44', '10', '3', '1', '1', '1', '120', '45,50', '0,00', '1']]);
    const result = toRecords(table, RECORD_KEY_11);
    assert.equal(result.records[0]['ns1:Superficie'], '120');
    assert.equal(result.records[0]['ns1:UnidadesGanaderas'], '45,50', 'coma decimal preservada tal cual, sin conversion numerica');
    assert.equal(Object.keys(result.records[0]).length, headers.length + 1, '15 columnas reales + la propiedad "key" agregada por toRecords()');
  });

  test('18 - record_key SIN el prefijo real (la curación previa a Bloque K) sigue fallando con columna(s) inexistente(s) - confirma que el gap era de nombres, no del parser', () => {
    const table = csvTable(headers, [['2025', '1', '0', '0', '0', '44', '10', '3', '1', '1', '1', '0', '0,00', '0,00', '1']]);
    const unprefixed = RECORD_KEY_11.map((c) => c.replace('ns1:', ''));
    assert.throws(() => toRecords(table, unprefixed), /columna\(s\) inexistente/);
  });
});
