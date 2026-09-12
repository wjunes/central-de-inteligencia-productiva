// Lógica pura de presentación de Situación (sin DOM). Fixtures con la MISMA
// forma real que devuelve GET /profiles/:id/radar (verificada por ejecución
// real en docs/arquitectura/contrato-situacion.md §7 y en
// situation-integration.test.js) - nunca una forma inventada.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { itemsByIntelligenceType, monitorEntries, primaryActivityId } from '../src/utils/situation.js';

function changeItem({ activityId, isPrimary = false, intelligence }) {
  return {
    activity_id: activityId,
    is_primary_activity: isPrimary,
    personalized_relevance: { base_level: 'low', level: 'low', bumps: [] },
    priority_match: false,
    signal: { id: 's1', signal_type: 'cambio-significativo', topic_id: 'precios', direction: 'increase', detected_at: '2026-01-01T00:00:00.000Z', source_id: 'src', monitor_id: 'mon', status: 'detected' },
    intelligence,
  };
}

describe('itemsByIntelligenceType', () => {
  test('sin filtro (null) aplana TODAS las unidades de inteligencia de todos los items', () => {
    const items = [
      changeItem({ activityId: 'a', intelligence: [{ type: 'opportunity', decisions: [] }] }),
      changeItem({ activityId: 'b', intelligence: [{ type: 'risk', decisions: [] }, { type: 'impact', decisions: [] }] }),
    ];
    const flat = itemsByIntelligenceType(items, null);
    assert.equal(flat.length, 3, 'un item con 2 unidades de inteligencia no debe perder ninguna al aplanar');
    assert.deepEqual(flat.map((e) => e.intel.type), ['opportunity', 'risk', 'impact']);
  });

  test('con filtro, solo conserva las unidades del tipo pedido (no descarta el item entero)', () => {
    const items = [changeItem({ activityId: 'b', intelligence: [{ type: 'risk', decisions: [] }, { type: 'impact', decisions: [] }] })];
    const onlyRisk = itemsByIntelligenceType(items, 'risk');
    assert.equal(onlyRisk.length, 1);
    assert.equal(onlyRisk[0].intel.type, 'risk');
    assert.equal(onlyRisk[0].item.activity_id, 'b');
  });

  test('sin coincidencias, devuelve un array vacío (no un error ni null)', () => {
    const items = [changeItem({ activityId: 'a', intelligence: [{ type: 'impact', decisions: [] }] })];
    assert.deepEqual(itemsByIntelligenceType(items, 'risk'), []);
  });
});

describe('monitorEntries', () => {
  test('extrae la recomendación real que clasificó el item como "para observar"', () => {
    const items = [
      changeItem({
        activityId: 'a',
        intelligence: [
          {
            type: 'impact',
            decisions: [
              { recommendation: { type: 'monitor', statement: 'Se recomienda monitorear la situación.', evidence_level: 'insufficient' } },
              { recommendation: { type: 'mitigate', statement: 'Otra cosa - no debe aparecer aquí.' } },
            ],
          },
        ],
      }),
    ];
    const entries = monitorEntries(items);
    assert.equal(entries.length, 1, 'solo la recomendación monitor/seek_information debe extraerse, no cualquier recomendación');
    assert.equal(entries[0].rec.statement, 'Se recomienda monitorear la situación.');
  });

  test('sin recomendaciones monitor/seek_information, no produce entradas', () => {
    const items = [changeItem({ activityId: 'a', intelligence: [{ type: 'risk', decisions: [{ recommendation: { type: 'mitigate', statement: 'x' } }] }] })];
    assert.deepEqual(monitorEntries(items), []);
  });

  test('un decision sin recomendación (recommendation: null) no rompe nada', () => {
    const items = [changeItem({ activityId: 'a', intelligence: [{ type: 'impact', decisions: [{ recommendation: null }] }] })];
    assert.deepEqual(monitorEntries(items), []);
  });
});

describe('primaryActivityId', () => {
  test('devuelve el activity_id marcado is_primary_activity por el backend', () => {
    const items = [changeItem({ activityId: 'secundaria', intelligence: [] }), changeItem({ activityId: 'principal', isPrimary: true, intelligence: [] })];
    assert.equal(primaryActivityId(items), 'principal');
  });

  test('sin ninguna actividad principal entre los items, devuelve null (nunca inventa una)', () => {
    const items = [changeItem({ activityId: 'secundaria', intelligence: [] })];
    assert.equal(primaryActivityId(items), null);
  });

  test('lista vacía devuelve null', () => {
    assert.equal(primaryActivityId([]), null);
  });
});
