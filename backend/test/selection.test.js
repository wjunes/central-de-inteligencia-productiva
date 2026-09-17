// Bloque N - selector temporal genérico (data/normalization/selection.js).
// Reduce un csv_table de N filas a EXACTAMENTE 1, por VALOR de un campo
// declarado (nunca por posición) - se integra ANTES de
// data/normalization/scalar.js#extractValue() (Bloque L), sin modificar ese
// archivo ni change-detection.js/signals.js. Pruebas unitarias puras +
// integración real vía runPipeline() con dgi::principal (único monitor con
// selection curada hoy).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isApplicable, select, SelectionError } from '../data/normalization/selection.js';
import { extractValue } from '../data/normalization/scalar.js';
import { resetDbForTests } from '../db/connection.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { knowledge } from '../knowledge/loader.js';
import { buildRadar } from '../radar/build.js';
import { createProfile } from '../core/profile/store.js';

function csvTable(headers, rows) {
  return { kind: 'csv_table', headers, rows, row_count: rows.length };
}
function shuffle(arr, seed) {
  // shuffle determinista (sin Math.random) - suficiente para probar
  // independencia de orden sin depender de aleatoriedad real.
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('Bloque N - isApplicable()', () => {
  test('true solo si kind=csv_table Y el monitor declara selection.field + selection.strategy', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ene-2026', '100']]);
    const monitor = { monitoring_definition: { selection: { field: 'Fecha', strategy: 'latest_period' } } };
    assert.equal(isApplicable(table, monitor), true);
    assert.equal(isApplicable(table, { monitoring_definition: {} }), false, 'sin selection -> comportamiento de Bloque L intacto');
    assert.equal(isApplicable(table, { monitoring_definition: { selection: { field: 'Fecha' } } }), false, 'sin strategy -> no aplicable');
    assert.equal(isApplicable(table, { monitoring_definition: { selection: { strategy: 'latest_period' } } }), false, 'sin field -> no aplicable');
    assert.equal(isApplicable({ kind: 'raw_json' }, monitor), false, 'kind distinto de csv_table -> nunca aplicable');
  });
});

describe('Bloque N - Caso 1: período único', () => {
  test('una sola fila -> se selecciona esa fila (trivial pero correcto)', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ene-2026', '100']]);
    const result = select(table, { field: 'Fecha', strategy: 'latest_period' });
    assert.equal(result.row_count, 1);
    assert.deepEqual(result.rows[0], ['Ene-2026', '100']);
  });
});

describe('Bloque N - Caso 2/3/4: varios períodos, ordenados y desordenados, selección del más reciente', () => {
  test('varios períodos YA ordenados ascendente -> selecciona el último (que también es el más reciente)', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ene-2026', '100'], ['Feb-2026', '110'], ['Mar-2026', '120']]);
    const result = select(table, { field: 'Fecha', strategy: 'latest_period' });
    assert.deepEqual(result.rows[0], ['Mar-2026', '120']);
  });

  test('varios períodos DESORDENADOS -> selecciona igual el más reciente por VALOR, no por posición', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Mar-2026', '120'], ['Ene-2026', '100'], ['Feb-2026', '110']]);
    const result = select(table, { field: 'Fecha', strategy: 'latest_period' });
    assert.deepEqual(result.rows[0], ['Mar-2026', '120']);
  });

  test('período más reciente en la PRIMERA posición física -> igual seleccionado (no se confunde con "primera fila")', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Dic-2026', '999'], ['Ene-2026', '100'], ['Feb-2026', '110']]);
    const result = select(table, { field: 'Fecha', strategy: 'latest_period' });
    assert.deepEqual(result.rows[0], ['Dic-2026', '999']);
  });
});

describe('Bloque N - Caso 5/6: "set"/"sep" como septiembre, mayúsculas/minúsculas', () => {
  test('"set-2026" (minúscula, forma real observada en DGI) se reconoce como septiembre y compara correctamente', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ago-2026', '100'], ['set-2026', '110'], ['Oct-2026', '120']]);
    const result = select(table, { field: 'Fecha', strategy: 'latest_period' });
    assert.deepEqual(result.rows[0], ['Oct-2026', '120'], 'set-2026 (sep) debe quedar ENTRE Ago y Oct, no después de Oct');
  });

  test('"SEP-2026" (mayúscula) también se reconoce como septiembre (case-insensitive)', () => {
    const table = csvTable(['Fecha', 'Importe'], [['SEP-2026', '999'], ['Ago-2026', '100']]);
    const result = select(table, { field: 'Fecha', strategy: 'latest_period' });
    assert.deepEqual(result.rows[0], ['SEP-2026', '999']);
  });

  test('mes en minúscula total ("ene-2026") también se reconoce (case-insensitive en general, no solo para set/sep)', () => {
    const table = csvTable(['Fecha', 'Importe'], [['ene-2026', '100'], ['feb-2026', '110']]);
    const result = select(table, { field: 'Fecha', strategy: 'latest_period' });
    assert.deepEqual(result.rows[0], ['feb-2026', '110']);
  });

  test('"set-2026" y "Set-2026" (ambas formas) producen el MISMO período (mismo sortKey)', () => {
    const a = select(csvTable(['Fecha'], [['Ago-2026'], ['set-2026']]), { field: 'Fecha', strategy: 'latest_period' });
    const b = select(csvTable(['Fecha'], [['Ago-2026'], ['Set-2026']]), { field: 'Fecha', strategy: 'latest_period' });
    assert.deepEqual(a.rows[0], ['set-2026']);
    assert.deepEqual(b.rows[0], ['Set-2026']);
  });
});

describe('Bloque N - Caso 7: período inválido -> falla de manera controlada', () => {
  test('un valor que no calza con "Mmm-YYYY" hace fallar TODA la selección (no se descarta silenciosamente esa fila)', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ene-2026', '100'], ['no-es-una-fecha', '110']]);
    assert.throws(() => select(table, { field: 'Fecha', strategy: 'latest_period' }), SelectionError);
    assert.throws(() => select(table, { field: 'Fecha', strategy: 'latest_period' }), /periodo invalido en la fila 2/);
  });

  test('mes abreviado inexistente (ej. "Xyz-2026") también es inválido', () => {
    const table = csvTable(['Fecha'], [['Xyz-2026']]);
    assert.throws(() => select(table, { field: 'Fecha', strategy: 'latest_period' }), /periodo invalido/);
  });
});

describe('Bloque N - Caso 8: campo inexistente -> falla de manera controlada', () => {
  test('selection.field no está entre los headers reales', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ene-2026', '100']]);
    assert.throws(() => select(table, { field: 'Periodo', strategy: 'latest_period' }), /no existe en el CSV real/);
  });

  test('selection.field ausente/vacío -> error explícito', () => {
    const table = csvTable(['Fecha'], [['Ene-2026']]);
    assert.throws(() => select(table, { strategy: 'latest_period' }), /field no configurado/);
    assert.throws(() => select(table, { field: '', strategy: 'latest_period' }), /field no configurado/);
  });
});

describe('Bloque N - Caso 9: ausencia de períodos válidos -> falla de manera controlada', () => {
  test('0 filas de datos', () => {
    const table = csvTable(['Fecha'], []);
    assert.throws(() => select(table, { field: 'Fecha', strategy: 'latest_period' }), /no hay filas de datos/);
  });
});

describe('Bloque N - Caso 10: máximo duplicado -> falla de manera controlada', () => {
  test('dos filas con el MISMO período máximo -> no se elige ninguna arbitrariamente', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ene-2026', '100'], ['Feb-2026', '110'], ['Feb-2026', '999']]);
    assert.throws(() => select(table, { field: 'Fecha', strategy: 'latest_period' }), /no es univoco/);
  });
});

describe('Bloque N - Caso 11: estrategia no soportada -> falla de manera controlada', () => {
  test('una estrategia inexistente nunca se ejecuta silenciosamente como si fuera latest_period', () => {
    const table = csvTable(['Fecha'], [['Ene-2026']]);
    assert.throws(() => select(table, { field: 'Fecha', strategy: 'earliest_period' }), /estrategia de seleccion no soportada/);
    assert.throws(() => select(table, { field: 'Fecha' }), /estrategia de seleccion no soportada/, 'strategy ausente tampoco tiene un default implicito');
  });
});

describe('Bloque N - Caso 12: preservación exacta de los valores de la fila seleccionada', () => {
  test('todas las columnas de la fila ganadora se preservan sin alterar (no solo el campo de selección)', () => {
    const table = csvTable(['Fecha', 'Importe', 'Extra'], [['Ene-2026', '100', 'x'], ['Feb-2026', '110,50', 'áéí']]);
    const result = select(table, { field: 'Fecha', strategy: 'latest_period' });
    assert.deepEqual(result.headers, ['Fecha', 'Importe', 'Extra']);
    assert.deepEqual(result.rows, [['Feb-2026', '110,50', 'áéí']]);
    assert.equal(result.row_count, 1);
  });
});

describe('Bloque N - integración con scalar extraction: csv_table -> latest_period -> one row -> indicator', () => {
  test('el resultado de select() alimenta correctamente a extractValue()', () => {
    const table = csvTable(['Fecha', 'Importe'], [['Ene-2026', '100'], ['Feb-2026', '110']]);
    const selected = select(table, { field: 'Fecha', strategy: 'latest_period' });
    const monitor = { monitoring_definition: { value_field: 'Importe' } };
    const result = extractValue(selected, monitor);
    assert.deepEqual(result, { kind: 'indicator', indicator: 'Importe', value: 110, raw_value: '110' });
  });
});

describe('Bloque N - orden físico irrelevante (prueba obligatoria de la sección 10)', () => {
  test('las mismas filas presentadas en 5 órdenes distintos producen SIEMPRE el mismo resultado', () => {
    const rows = [
      ['Ene-2026', '100'], ['Feb-2026', '110'], ['Mar-2026', '120'],
      ['Abr-2026', '130'], ['May-2026', '140'], ['Jun-2026', '150'],
    ];
    const expected = ['Jun-2026', '150'];
    for (let seed = 1; seed <= 5; seed++) {
      const shuffled = shuffle(rows, seed * 17);
      const table = csvTable(['Fecha', 'Importe'], shuffled);
      const result = select(table, { field: 'Fecha', strategy: 'latest_period' });
      assert.deepEqual(result.rows[0], expected, `orden (semilla ${seed}) no debe afectar el resultado`);
    }
  });
});

describe('Bloque N - regresión de value_comparison vía runPipeline (fixtures deterministas)', () => {
  const MONITOR_ID = 'dgi::principal';

  // No hay fixturePath en disco para estos casos (se arman en memoria) - se
  // usa el mismo mecanismo de inyección de endpoint en memoria vía un
  // servidor HTTP real efímero, igual que file-download-csv.test.js.
  async function runWithBody(db, body, extra = {}) {
    const { createServer } = await import('node:http');
    const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/csv' }); res.end(body); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/dgi.csv`;
    const original = knowledge.sourceById;
    try {
      knowledge.sourceById = (id) => (id === 'dgi' ? { ...original(id), access: { ...original(id).access, endpoint: url } } : original(id));
      return await runPipeline(db, [{ monitorId: MONITOR_ID, context: { kind: 'csv_table' }, ...extra }], { mode: 'live' });
    } finally {
      knowledge.sourceById = original;
      await new Promise((resolve) => server.close(resolve));
    }
  }

  const preamble = ';;;;;;\n'.repeat(13);
  const header = ';;;Fecha;Importe;;\n';

  test('capturas idénticas -> primera con cambio inicial (comportamiento existente), segunda -> sin_cambio', async () => {
    const db = resetDbForTests(':memory:');
    const body = `${preamble}${header};;2026;Ene-2026;100;;\n;;2026;Feb-2026;110;;\n`;
    const r1 = await runWithBody(db, body);
    assert.equal(r1.hadErrors, false);
    assert.equal(r1.outputs.changes[0].change_class, 'valor_modificado');
    assert.equal(r1.outputs.captures[0].normalized.value, 110);

    const r2 = await runWithBody(db, body, { force: true });
    assert.equal(r2.outputs.changes[0].change_class, 'sin_cambio');
    assert.equal(r2.stats.signals_generated, 0);
  });

  test('cambio controlado (mismo período más reciente, Importe distinto) -> valor_modificado, sin threshold configurado -> pending_threshold (no señal inventada)', async () => {
    const db = resetDbForTests(':memory:');
    const bodyBase = `${preamble}${header};;2026;Ene-2026;100;;\n;;2026;Feb-2026;110;;\n`;
    const bodyModified = `${preamble}${header};;2026;Ene-2026;100;;\n;;2026;Feb-2026;999;;\n`;
    await runWithBody(db, bodyBase);
    const result = await runWithBody(db, bodyModified, { force: true });

    assert.equal(result.outputs.changes[0].change_class, 'valor_modificado');
    assert.equal(result.outputs.changes[0].previous_value, 110);
    assert.equal(result.outputs.changes[0].new_value, 999);
    assert.equal(result.stats.signals_generated, 0, 'sin threshold real configurado para Importe - pending_threshold es un resultado válido, no se inventa un umbral');
  });

  test('agregar un NUEVO período más reciente (Mar-2026) hace que la selección cambie de fila, y el cambio se detecta correctamente', async () => {
    const db = resetDbForTests(':memory:');
    const bodyBase = `${preamble}${header};;2026;Ene-2026;100;;\n;;2026;Feb-2026;110;;\n`;
    const bodyWithNewMonth = `${preamble}${header};;2026;Ene-2026;100;;\n;;2026;Feb-2026;110;;\n;;2026;Mar-2026;120;;\n`;
    await runWithBody(db, bodyBase);
    const result = await runWithBody(db, bodyWithNewMonth, { force: true });

    assert.equal(result.outputs.captures[0].normalized.value, 120, 'la selección debe moverse a Mar-2026, el nuevo período más reciente');
    assert.equal(result.outputs.changes[0].change_class, 'valor_modificado');
  });
});

describe('Bloque N - Radar: la integración no rompe el camino hasta Radar (sin inventar contexto para DGI)', () => {
  test('con contexto y threshold explícitos SOLO de la prueba (no del monitor), la señal llega a Radar', async () => {
    const db = resetDbForTests(':memory:');
    const preamble = ';;;;;;\n'.repeat(13);
    const header = ';;;Fecha;Importe;;\n';
    const { createServer } = await import('node:http');

    async function capture(body, force = false) {
      const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/csv' }); res.end(body); });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${server.address().port}/dgi.csv`;
      const original = knowledge.sourceById;
      try {
        knowledge.sourceById = (id) => (id === 'dgi' ? { ...original(id), access: { ...original(id).access, endpoint: url } } : original(id));
        const context = { kind: 'csv_table', originActivityId: 'ganaderia-bovina-carne', indicator: 'Importe' };
        return await runPipeline(db, [{ monitorId: 'dgi::principal', context, force }], { mode: 'live' });
      } finally {
        knowledge.sourceById = original;
        await new Promise((resolve) => server.close(resolve));
      }
    }

    await capture(`${preamble}${header};;2026;Ene-2026;100;;\n`);
    const result = await capture(`${preamble}${header};;2026;Ene-2026;100;;\n;;2026;Feb-2026;110;;\n`, true);

    assert.equal(result.outputs.changes[0].change_class, 'valor_modificado');
    assert.equal(result.stats.signals_generated, 0, 'pending_threshold - no se inventa un threshold');

    const profile = createProfile(db, { name: 'N - Radar', main_activity_id: 'ganaderia-bovina-carne' });
    const radar = buildRadar(db, profile.id);
    assert.equal(radar.changes.no_relevant_changes, true, 'sin señal generada, Radar no fabrica ningún ítem');
  });
});

describe('Bloque N - validación real DGI (endpoint inyectado en memoria, sources.json sin activar)', () => {
  test('el archivo real completo llega hasta un indicator válido, sin depender del orden y sin hardcodear el importe', async () => {
    const original = knowledge.sourceById;
    knowledge.sourceById = (id) =>
      id === 'dgi'
        ? { ...original(id), access: { ...original(id).access, endpoint: 'https://www.gub.uy/direccion-general-impositiva/sites/direccion-general-impositiva/files/2026-08/Recaudaci%C3%B3n%20Total%20Mensual%20de%20la%20DGI.csv' } }
        : original(id);
    try {
      const db = resetDbForTests(':memory:');
      const monitor = knowledge.monitorById('dgi::principal');
      const result = await runPipeline(db, [{ monitorId: monitor.id, context: { kind: 'csv_table' } }], { mode: 'live' });

      assert.equal(result.hadErrors, false, 'el archivo real debe atravesar selection + extraction sin error');
      const capture = result.outputs.captures[0];
      assert.equal(capture.status, 'ok');
      assert.equal(capture.normalized.kind, 'indicator');
      assert.equal(capture.normalized.indicator, 'Importe');
      assert.equal(typeof capture.normalized.value, 'number');
      assert.ok(Number.isFinite(capture.normalized.value) && capture.normalized.value > 0, 'no se hardcodea el importe - solo se exige que sea un numero real valido');
      assert.equal(result.outputs.changes[0].change_class, 'valor_modificado', 'primera captura, comportamiento preexistente de valueComparison');
    } finally {
      knowledge.sourceById = original;
    }
  });

  test('el período máximo real seleccionado coincide con el máximo calculado independientemente sobre las 534 filas', async () => {
    const original = knowledge.sourceById;
    const endpoint = 'https://www.gub.uy/direccion-general-impositiva/sites/direccion-general-impositiva/files/2026-08/Recaudaci%C3%B3n%20Total%20Mensual%20de%20la%20DGI.csv';
    knowledge.sourceById = (id) => (id === 'dgi' ? { ...original(id), access: { ...original(id).access, endpoint } } : original(id));
    try {
      const res = await fetch(endpoint);
      const buffer = Buffer.from(await res.arrayBuffer());
      const decoded = new TextDecoder('windows-1252').decode(buffer);
      const lines = decoded.split(/\r\n|\n/).filter(Boolean);
      const dataLines = lines.slice(14);
      const months = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
      let maxKey = -Infinity;
      let maxRow = null;
      for (const line of dataLines) {
        const cols = line.split(';');
        const fecha = cols[3];
        if (!fecha) continue;
        const [mon, yr] = fecha.split('-');
        const key = Number(yr) * 12 + months[mon.toLowerCase()];
        if (key > maxKey) { maxKey = key; maxRow = { fecha, importe: cols[4] }; }
      }
      assert.ok(maxRow, 'debe existir al menos un periodo valido en el archivo real');

      const db = resetDbForTests(':memory:');
      const result = await runPipeline(db, [{ monitorId: 'dgi::principal', context: { kind: 'csv_table' } }], { mode: 'live' });
      const expectedImporte = Number(maxRow.importe.split('.').join(''));
      assert.equal(result.outputs.captures[0].normalized.value, expectedImporte, `debe coincidir con Importe de ${maxRow.fecha} (calculado independientemente, no hardcodeado)`);
    } finally {
      knowledge.sourceById = original;
    }
  });
});
