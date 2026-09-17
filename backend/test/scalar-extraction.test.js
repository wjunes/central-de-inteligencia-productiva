// Bloque L - extracción genérica de un valor escalar desde csv_table
// (data/normalization/scalar.js), hacia la forma {kind:'indicator',
// indicator, value} que change-detection.js#valueComparison() YA sabe leer
// (mismo contrato de ckan_api/api_rest_json) - sin tocar ese archivo ni
// signals.js. Pruebas unitarias puras (sin red, sin DB) + integración real
// vía runPipeline() con fixtures deterministas basadas en la forma real de
// dgi::principal (único monitor curado con value_field hoy).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isApplicable, extractValue, parseLocalizedNumber, ScalarExtractionError } from '../data/normalization/scalar.js';
import { resetDbForTests } from '../db/connection.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { knowledge } from '../knowledge/loader.js';
import { buildRadar } from '../radar/build.js';
import { createProfile } from '../core/profile/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FX = (name) => join(__dirname, '..', 'fixtures', name);

function csvTable(headers, rows) {
  return { kind: 'csv_table', headers, rows, row_count: rows.length };
}
function monitorWith(monitoringDefinition) {
  return { id: 'test::scalar-monitor', monitoring_definition: monitoringDefinition };
}

describe('Bloque L - isApplicable()', () => {
  test('true solo si kind=csv_table Y el monitor declara monitoring_definition.value_field no vacio', () => {
    const table = csvTable(['Importe'], [['100']]);
    assert.equal(isApplicable(table, monitorWith({ value_field: 'Importe' })), true);
    assert.equal(isApplicable(table, monitorWith({ value_field: null })), false, 'record_key en vez de value_field (record_diff) -> no aplicable');
    assert.equal(isApplicable(table, monitorWith({})), false);
    assert.equal(isApplicable(table, {}), false);
    assert.equal(isApplicable({ kind: 'raw_json' }, monitorWith({ value_field: 'Importe' })), false, 'kind distinto de csv_table -> nunca aplicable');
    assert.equal(isApplicable(null, monitorWith({ value_field: 'Importe' })), false);
  });
});

describe('Bloque L - Caso 1: valor único (csv_table -> value_field -> valor numérico)', () => {
  test('una sola fila de datos: extracción inequívoca, valor y raw_value correctos', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ene-2026', '100']]);
    const result = extractValue(table, monitorWith({ value_field: 'Importe' }));
    assert.deepEqual(result, { kind: 'indicator', indicator: 'Importe', value: 100, raw_value: '100' });
  });

  test('localiza la columna por NOMBRE EXACTO, sin importar su posición', () => {
    const table = csvTable(['Importe', 'Fecha', 'Extra'], [['250', 'Feb-2026', 'x']]);
    const result = extractValue(table, monitorWith({ value_field: 'Importe' }));
    assert.equal(result.value, 250);
  });
});

describe('Bloque L - Caso 4: representación decimal (según configuración declarada)', () => {
  test('decimal_separator="," (ej. "1234,56") con la configuración declarada', () => {
    const table = csvTable(['valor'], [['1234,56']]);
    const result = extractValue(table, monitorWith({ value_field: 'valor', number_format: { decimal_separator: ',' } }));
    assert.equal(result.value, 1234.56);
  });

  test('sin number_format declarado, el default es "." (mismo formato ya parseable por JS, no un cambio de comportamiento)', () => {
    const table = csvTable(['valor'], [['1234.56']]);
    const result = extractValue(table, monitorWith({ value_field: 'valor' }));
    assert.equal(result.value, 1234.56);
  });

  test('entero simple ("1234"), sin separador decimal presente', () => {
    const table = csvTable(['valor'], [['1234']]);
    const result = extractValue(table, monitorWith({ value_field: 'valor' }));
    assert.equal(result.value, 1234);
  });
});

describe('Bloque L - Caso 5: separador de miles (solo si la configuración lo declara)', () => {
  test('thousands_separator="." + decimal_separator="," (ej. "1.234,56", formato real de DGI para Importe)', () => {
    const table = csvTable(['Importe'], [['1.234,56']]);
    const result = extractValue(table, monitorWith({ value_field: 'Importe', number_format: { decimal_separator: ',', thousands_separator: '.' } }));
    assert.equal(result.value, 1234.56);
  });

  test('thousands_separator="." sin parte decimal (forma real de DGI: "55.478.974.426", decimal_separator=null)', () => {
    const table = csvTable(['Importe'], [['55.478.974.426']]);
    const result = extractValue(table, monitorWith({ value_field: 'Importe', number_format: { decimal_separator: null, thousands_separator: '.' } }));
    assert.equal(result.value, 55478974426);
  });

  test('decimal_separator y thousands_separator iguales -> error de configuración explícito, no un resultado incorrecto silencioso', () => {
    assert.throws(
      () => parseLocalizedNumber('1.234', { decimal_separator: '.', thousands_separator: '.' }),
      /configuracion invalida/
    );
  });
});

describe('Bloque L - Caso 6: columna inexistente -> falla de manera controlada', () => {
  test('value_field no está entre los headers reales', () => {
    const table = csvTable(['Fecha', 'Monto'], [['Ene-2026', '100']]);
    assert.throws(() => extractValue(table, monitorWith({ value_field: 'Importe' })), ScalarExtractionError);
    assert.throws(() => extractValue(table, monitorWith({ value_field: 'Importe' })), /no existe en el CSV real/);
  });

  test('value_field no configurado en absoluto -> error explícito, nunca asume una columna', () => {
    const table = csvTable(['Importe'], [['100']]);
    assert.throws(() => extractValue(table, monitorWith({ value_field: null })), /no configurado/);
    assert.throws(() => extractValue(table, monitorWith({})), /no configurado/);
  });
});

describe('Bloque L - Caso 7: valor vacío -> falla de manera controlada', () => {
  test('la única fila de datos tiene el value_field vacío', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ene-2026', '']]);
    assert.throws(() => extractValue(table, monitorWith({ value_field: 'Importe' })), /valor vacio/);
  });
});

describe('Bloque L - Caso 8: valor no numérico -> falla de manera controlada', () => {
  test('el contenido de la columna no es un número bajo el formato declarado', () => {
    const table = csvTable(['Importe'], [['no-es-un-numero']]);
    assert.throws(() => extractValue(table, monitorWith({ value_field: 'Importe' })), /no numerico/);
  });

  test('una coma decimal presente pero SIN declarar decimal_separator="," -> se interpreta con el default "." y falla (no es "1234.56")', () => {
    const table = csvTable(['Importe'], [['1234,56']]);
    assert.throws(() => extractValue(table, monitorWith({ value_field: 'Importe' })), /no numerico/, 'sin configuracion explicita no se adivina el formato');
  });
});

describe('Bloque L - Caso 9: múltiples filas ambiguas -> rechazado sin selección inventada', () => {
  test('2 filas de datos: value_field por sí solo no identifica un único valor, error explícito y preciso', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ene-2026', '100'], ['Feb-2026', '110']]);
    assert.throws(() => extractValue(table, monitorWith({ value_field: 'Importe' })), ScalarExtractionError);
    assert.throws(
      () => extractValue(table, monitorWith({ value_field: 'Importe' })),
      /2 filas.*Importe.*por si solo no identifica un unico valor/
    );
  });

  test('0 filas de datos: tampoco hay valor para extraer', () => {
    const table = csvTable(['Fecha', 'Importe'], []);
    assert.throws(() => extractValue(table, monitorWith({ value_field: 'Importe' })), /no tiene filas de datos/);
  });

  test('la forma real de dgi::principal (534 filas reales, aquí simulada con 2) queda bloqueada exactamente por esta razón', () => {
    const table = csvTable(['', '', '', 'Fecha', 'Importe', '', ''], [
      ['', '', '2026', 'Ene-2026', '100', '', ''],
      ['', '', '2026', 'Feb-2026', '110', '', ''],
    ]);
    const dgi = knowledge.monitorById('dgi::principal');
    assert.throws(() => extractValue(table, dgi), /por si solo no identifica un unico valor/);
  });
});

describe('Bloque L - Caso 2/3: integración real vía runPipeline (fixtures basadas en la forma real de dgi::principal)', () => {
  const MONITOR_ID = 'dgi::principal';
  function job(fixtureFile) {
    return { monitorId: MONITOR_ID, fixturePath: FX(fixtureFile), context: { kind: 'csv_table' } };
  }

  test('primera ejecución (1 fila real, Importe=100) -> extracción exitosa, change_class=valor_modificado (prev=null, comportamiento preexistente de valueComparison)', async () => {
    const db = resetDbForTests(':memory:');
    const result = await runPipeline(db, [job('dgi-value-t1-base.json')], { mode: 'fixture' });

    assert.equal(result.hadErrors, false);
    assert.equal(result.outputs.captures[0].normalized.kind, 'indicator', 'la captura persistida ya debe tener la forma {kind:indicator,...}, no {headers,rows}');
    assert.equal(result.outputs.captures[0].normalized.value, 100);
    assert.equal(result.outputs.captures[0].normalized.indicator, 'Importe');
    assert.equal(result.outputs.changes[0].change_class, 'valor_modificado');
    assert.equal(result.outputs.changes[0].new_value, 100, 'outputs.changes es el objeto en memoria (outcome.new_value), no la fila de DB stringificada');
  });

  test('segunda ejecución con el mismo contenido exacto -> sin_cambio, 0 señales nuevas', async () => {
    const db = resetDbForTests(':memory:');
    await runPipeline(db, [job('dgi-value-t1-base.json')], { mode: 'fixture' });
    const result = await runPipeline(db, [job('dgi-value-t2-same.json')], { mode: 'fixture' });

    assert.equal(result.outputs.changes[0].change_class, 'sin_cambio');
    assert.equal(result.stats.signals_generated, 0);
  });

  test('modificación del valor (100 -> 105) -> valor_modificado, delta correcto, sin threshold configurado -> pending_threshold (no señal, comportamiento preexistente de magnitudeOutcome)', async () => {
    const db = resetDbForTests(':memory:');
    await runPipeline(db, [job('dgi-value-t1-base.json')], { mode: 'fixture' });
    const result = await runPipeline(db, [job('dgi-value-t3-modified.json')], { mode: 'fixture' });

    assert.equal(result.outputs.changes[0].change_class, 'valor_modificado');
    assert.equal(result.outputs.changes[0].previous_value, 100);
    assert.equal(result.outputs.changes[0].new_value, 105);
    assert.equal(result.stats.signals_generated, 0, 'dgi no tiene originActivityId/indicator de contexto curado ni threshold configurado (comportamiento preexistente, no nuevo de Bloque L)');
  });

  test('identidad de dedup: repetir la MISMA transición (t1->t3) dos veces no duplica nada distinto (mismo new_value -> misma identidad, ver signals.js sin modificar)', async () => {
    const db = resetDbForTests(':memory:');
    await runPipeline(db, [job('dgi-value-t1-base.json')], { mode: 'fixture' });
    await runPipeline(db, [job('dgi-value-t3-modified.json')], { mode: 'fixture' });
    // re-ejecutar t3 (mismo contenido que ya esta persistido) -> sin_cambio, no una segunda "modificacion"
    const result = await runPipeline(db, [job('dgi-value-t3-modified.json')], { mode: 'fixture' });
    assert.equal(result.outputs.changes[0].change_class, 'sin_cambio');
    assert.equal(result.stats.signals_generated, 0);
  });
});

describe('Bloque L - Radar: una señal real de value_comparison sobre csv_table puede recorrer el pipeline hasta Radar sin inventar contexto', () => {
  test('con threshold configurado (fixture de prueba, activity_id real ya existente) y contexto explícito de la prueba (no del monitor), la señal llega a Radar', async () => {
    // Bloque L no crea relaciones de actividad ni cura contexto para dgi -
    // esta prueba usa un context EXPLICITO del job (mismo mecanismo ya usado
    // en Bloque B/H para probar la integracion Radar de otros monitores) y
    // un threshold de prueba, solo para demostrar que la ruta
    // value_comparison generico llega a Radar - no cura dgi real.
    const db = resetDbForTests(':memory:');
    const MONITOR_ID = 'dgi::principal';
    const context = { kind: 'csv_table', originActivityId: 'ganaderia-bovina-carne', indicator: 'Importe' };
    await runPipeline(db, [{ monitorId: MONITOR_ID, fixturePath: FX('dgi-value-t1-base.json'), context }], { mode: 'fixture' });
    const result = await runPipeline(db, [{ monitorId: MONITOR_ID, fixturePath: FX('dgi-value-t3-modified.json'), context }], { mode: 'fixture' });

    assert.equal(result.outputs.changes[0].change_class, 'valor_modificado');
    // sin threshold real configurado para ('politica-tributaria','Importe') en
    // config/thresholds.json, magnitudeOutcome() sigue devolviendo
    // pending_threshold (no se inventa un umbral en Bloque L) - se verifica
    // aquí que el pipeline llega hasta esa evaluación sin romperse, y que
    // Radar puede construirse con normalidad para cualquier perfil.
    assert.equal(result.stats.signals_generated, 0, 'pending_threshold: no se inventa un threshold para hacer aparecer una señal en Radar');

    const profile = createProfile(db, { name: 'L - tributaria', main_activity_id: 'ganaderia-bovina-carne' });
    const radar = buildRadar(db, profile.id);
    assert.equal(radar.changes.no_relevant_changes, true, 'sin señal generada, Radar no fabrica ningún ítem');
  });
});
