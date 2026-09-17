// Bloque G - integración completa: csv_table -> toRecords -> record_diff
// real (sin reimplementarlo) -> generateSignal real. Usa el monitor
// ursea::precios-paridad-combustibles ya curado (Bloque F/G: record_key y
// context reales en monitors.json) con fixtures sintéticas de la misma
// forma que produciría el CSV real, en modo 'fixture' (sin red).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../db/connection.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { knowledge } from '../knowledge/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FX = (name) => join(__dirname, '..', 'fixtures', name);

const MONITOR_ID = 'ursea::precios-paridad-combustibles';

function job(fixtureFile) {
  return { monitorId: MONITOR_ID, fixturePath: FX(fixtureFile), context: { kind: 'csv_table', originActivityId: 'combustibles' } };
}

describe('Bloque G - primera ejecución (sin captura previa)', () => {
  test('nuevo_registro: coherente con el mecanismo existente de record_diff (prev vacío -> todo es "nuevo"), no es una fabricación nueva de esta etapa', async () => {
    const db = resetDbForTests(':memory:');
    const result = await runPipeline(db, [job('tabular-t1-base.json')], { mode: 'fixture' });

    assert.equal(result.hadErrors, false);
    assert.equal(result.outputs.captures[0].normalized.records.length, 2, 'la captura persistida ya debe tener la forma {records:[...]}, no {headers,rows}');
    assert.equal(result.outputs.changes[0].change_class, 'nuevo_registro');
    assert.equal(result.stats.signals_generated, 1, 'record_diff + change_class=nuevo_registro -> signal (mismo comportamiento ya validado para otros monitores desde Bloque A)');
    assert.equal(result.outputs.signals[0].signal_type, 'nuevo-elemento');
    assert.equal(result.outputs.signals[0].origin_activity_id, 'combustibles', 'el contexto se propaga igual que en Bloque B');
  });
});

describe('Bloque G - ejecuciones posteriores (con snapshot previo real, vía persistNormalized)', () => {
  test('mismo contenido -> sin_cambio, 0 señales nuevas', async () => {
    const db = resetDbForTests(':memory:');
    await runPipeline(db, [job('tabular-t1-base.json')], { mode: 'fixture' });
    const result = await runPipeline(db, [job('tabular-t2-same.json')], { mode: 'fixture' });

    assert.equal(result.outputs.changes[0].change_class, 'sin_cambio');
    assert.equal(result.stats.signals_generated, 0);
  });

  test('modificación de un registro existente -> change_class=valor_modificado, y desde Bloque H3 SÍ genera señal (cambio-estructural, sin magnitud inventada)', async () => {
    const db = resetDbForTests(':memory:');
    await runPipeline(db, [job('tabular-t1-base.json')], { mode: 'fixture' });
    const result = await runPipeline(db, [job('tabular-t3-modified.json')], { mode: 'fixture' });

    assert.equal(result.outputs.changes[0].change_class, 'valor_modificado', 'record_diff detecta correctamente la modificación');
    assert.equal(result.hadErrors, false);
    assert.equal(
      result.stats.signals_generated,
      1,
      'Bloque H3: evaluateSignalRule() ahora distingue record_diff de value_comparison para valor_modificado - record_diff produce un cambio ESTRUCTURAL (signal_type=cambio-estructural), sin pasar por magnitudeOutcome() ni inventar threshold/indicator/porcentaje.'
    );
    assert.equal(result.outputs.signals[0].signal_type, 'cambio-estructural');
  });

  test('alta de un registro nuevo (sobre una base ya existente) -> change_class=nuevo_registro, y desde Bloque H2 SÍ genera una segunda señal (identidad determinista, ya no colisiona)', async () => {
    const db = resetDbForTests(':memory:');
    const r0 = await runPipeline(db, [job('tabular-t1-base.json')], { mode: 'fixture' }); // ya genera 1 señal (primera ejecución)
    assert.equal(r0.stats.signals_generated, 1);
    const result = await runPipeline(db, [job('tabular-t4-added.json')], { mode: 'fixture' });

    assert.equal(result.outputs.changes[0].change_class, 'nuevo_registro', 'record_diff detecta correctamente el nuevo cierre (Gas Oil 10S, 2026-02-25) - mismo escenario real descubierto en Bloque G/H1');
    assert.equal(
      result.stats.signals_generated,
      1,
      'Bloque H2: eventIdentity() deriva la identidad del registro real afectado (claves ordenadas de newKeys) en vez de colapsar a "[object Object]" - una alta genuinamente distinta ya no colisiona con el dedup_key de la primera.'
    );
    const rows = db.prepare('SELECT dedup_key FROM signals').all();
    assert.equal(rows.length, 2, 'ahora hay 2 señales activas distintas: la del primer nuevo_registro y la de esta segunda alta');
    assert.notEqual(rows[0].dedup_key, rows[1].dedup_key, 'dedup_keys distintos para eventos distintos');
  });

  test('baja de un registro -> change_class=registro_eliminado, SÍ genera señal (dedup_key distinto: primera vez que aparece este change_class para este monitor)', async () => {
    const db = resetDbForTests(':memory:');
    await runPipeline(db, [job('tabular-t1-base.json')], { mode: 'fixture' });
    const result = await runPipeline(db, [job('tabular-t5-removed.json')], { mode: 'fixture' });

    assert.equal(result.outputs.changes[0].change_class, 'registro_eliminado');
    assert.equal(result.stats.signals_generated, 1, 'a diferencia del caso anterior, esta es la PRIMERA vez que este monitor produce un dedup_key con change_class=registro_eliminado - no colisiona con el de nuevo_registro (Bloque A/B ya validaron señales por baja de elementos en dataset_list, mismo patrón)');
    assert.equal(result.outputs.signals[0].signal_type, 'elemento-retirado');
  });
});

describe('Bloque G - deduplicación (dedup_key) real: mismo mecanismo, comportamiento verificado con datos reales de la tabla', () => {
  test('el motor de deduplicación sigue intacto: ejecutar dos veces la MISMA transición exacta no duplica señales', async () => {
    const db = resetDbForTests(':memory:');
    await runPipeline(db, [job('tabular-t1-base.json')], { mode: 'fixture' });
    const r1 = await runPipeline(db, [job('tabular-t5-removed.json')], { mode: 'fixture' });
    assert.equal(r1.stats.signals_generated, 1);

    // Re-ejecutar t5 otra vez (mismo estado que ya está persistido) - el
    // motor de cambios ve sin_cambio (no hay una segunda "baja" real), por
    // lo que ni siquiera intenta deduplicar una señal nueva.
    const r2 = await runPipeline(db, [job('tabular-t5-removed.json')], { mode: 'fixture' });
    assert.equal(r2.outputs.changes[0].change_class, 'sin_cambio');
    assert.equal(r2.stats.signals_generated, 0);

    const signalsCount = db.prepare('SELECT COUNT(*) as c FROM signals').get().c;
    assert.equal(signalsCount, 2, 'la señal de t1 (nuevo_registro) + la de la baja (registro_eliminado) - ninguna de las dos se duplicó pese a 3 corridas totales (t1, t5, t5 otra vez)');
  });
});

describe('Bloque G - errores de estructura no abortan el resto del batch', () => {
  test('un job con record_key duplicada (CSV real pero clave ambigua) queda como error individual, sin abortar otro job válido', async () => {
    const db = resetDbForTests(':memory:');
    const badFixture = FX('tabular-t1-base.json'); // baseline válido, lo dañamos con un fixture ad-hoc a continuación
    const dupPath = FX('tabular-t1-base.json');
    // Construimos un job "roto" reutilizando ursec::principal (record_key=[Fecha])
    // contra el fixture de ursea (que no tiene columna 'Fecha') para forzar
    // el camino de error de forma determinista, sin inventar un tercer archivo.
    const brokenJob = { monitorId: 'ursec::principal', fixturePath: dupPath, context: { kind: 'csv_table' } };
    const goodJob = job('tabular-t1-base.json');

    const result = await runPipeline(db, [goodJob, brokenJob], { mode: 'fixture' });
    assert.equal(result.hadErrors, true);
    assert.equal(result.outputs.captures.length, 2, 'ambos jobs se procesan aunque uno falle en la normalización');
    assert.equal(result.stats.signals_generated, 1, 'el job válido sigue generando su señal con normalidad');

    const errors = db.prepare("SELECT stage, message FROM errors WHERE stage = 'normalize'").all();
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /columna\(s\) inexistente/);
  });
});

describe('Bloque G - regresión: monitores fuera de alcance (mgap-snig/dgi/opp) permanecen sin cambios funcionales', () => {
  test('mgap-snig y dgi NO tienen change_detection.record_key -> isApplicable() sigue devolviendo false para ellos', async () => {
    const { isApplicable } = await import('../data/normalization/tabular.js');
    const snig = knowledge.monitorById('mgap-snig::principal');
    const dgi = knowledge.monitorById('dgi::principal');
    assert.equal(isApplicable({ kind: 'csv_table', headers: [], rows: [] }, snig), false);
    assert.equal(isApplicable({ kind: 'csv_table', headers: [], rows: [] }, dgi), false);
  });
});
