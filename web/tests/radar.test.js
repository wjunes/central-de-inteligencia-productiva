// Lógica pura de Radar Productivo (Paso 2D-2), sin DOM. Fixtures con la misma
// forma real verificada en docs/arquitectura/contrato-radar.md (perfil
// multiactividad ganadería/soja/aceites) - nunca una forma inventada.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  uniqueActivityIds,
  uniqueRelevanceLevels,
  changesForType,
  applyChangeFilters,
  filterSituations,
  filterRecommendations,
  resolveMemberDirection,
  findDecisionForRecommendation,
  changeItemKey,
  situationKey,
} from '../src/utils/radar.js';

function changeItem({ activityId, level, signalId = 's1', direction = 'increase', intelligence }) {
  return {
    activity_id: activityId,
    is_primary_activity: false,
    personalized_relevance: { base_level: level, level, bumps: [] },
    priority_match: false,
    signal: { id: signalId, signal_type: 'cambio-significativo', topic_id: 'precios', direction, detected_at: '2026-01-01T00:00:00.000Z', source_id: 'src', monitor_id: 'mon', status: 'detected' },
    intelligence,
  };
}

const aceites = changeItem({ activityId: 'elaboracion-aceites', level: 'high', intelligence: [{ id: 'i1', type: 'risk', decisions: [{ id: 'd1', recommendation: { id: 'r1', type: 'mitigate', decision_id: 'd1' } }] }] });
const soja = changeItem({ activityId: 'cultivo-soja', level: 'low', intelligence: [{ id: 'i2', type: 'opportunity', decisions: [{ id: 'd2', recommendation: { id: 'r2', type: 'pursue_opportunity', decision_id: 'd2' } }] }] });
const ganaderia = changeItem({ activityId: 'ganaderia-bovina-carne', level: 'low', direction: 'uncertain', intelligence: [{ id: 'i3', type: 'impact', decisions: [{ id: 'd3', recommendation: { id: 'r3', type: 'monitor', decision_id: 'd3' } }] }] });

function buildRadarFixture() {
  return {
    profile_id: 'p1',
    changes: { no_relevant_changes: false, items: [aceites, soja, ganaderia] },
    situations: {
      no_active_situations: false,
      items: [
        {
          id: 'sit1', topic_id: 'precios', activity_ids: ['elaboracion-aceites', 'cultivo-soja', 'ganaderia-bovina-carne'],
          personalized_relevance: { level: 'high' },
          members: [
            { activity_id: 'elaboracion-aceites', signal_id: 's1', intelligence_ids: ['i1'] },
            { activity_id: 'cultivo-soja', signal_id: 's1', intelligence_ids: ['i2'] },
            { activity_id: 'ganaderia-bovina-carne', signal_id: 's-otra', intelligence_ids: ['i3'] }, // signal_id que NO coincide con ningún change item vigente
          ],
        },
      ],
      resolved: [],
    },
    risks: [aceites],
    opportunities: [soja],
    monitor: [ganaderia],
    recommendations: [
      { id: 'r1', type: 'mitigate', decision_id: 'd1', activity_id: 'elaboracion-aceites', statement: 'x' },
      { id: 'r2', type: 'pursue_opportunity', decision_id: 'd2', activity_id: 'cultivo-soja', statement: 'y' },
      { id: 'r-huerfana', type: 'monitor', decision_id: 'd-inexistente', activity_id: 'cultivo-soja', statement: 'z' },
    ],
  };
}

describe('uniqueActivityIds / uniqueRelevanceLevels', () => {
  test('uniqueActivityIds conserva cada actividad una sola vez, en orden de primera aparición', () => {
    assert.deepEqual(uniqueActivityIds([aceites, soja, ganaderia, aceites]), ['elaboracion-aceites', 'cultivo-soja', 'ganaderia-bovina-carne']);
  });

  test('uniqueRelevanceLevels solo incluye los niveles REALMENTE presentes, en orden critical->none', () => {
    assert.deepEqual(uniqueRelevanceLevels([aceites, soja, ganaderia]), ['high', 'low']);
  });

  test('uniqueRelevanceLevels con lista vacía devuelve vacío (nunca inventa niveles)', () => {
    assert.deepEqual(uniqueRelevanceLevels([]), []);
  });
});

describe('changesForType / applyChangeFilters', () => {
  const radar = buildRadarFixture();

  test('changesForType elige el array YA calculado por el backend, no reclasifica', () => {
    assert.equal(changesForType(radar, 'risk'), radar.risks);
    assert.equal(changesForType(radar, 'opportunity'), radar.opportunities);
    assert.equal(changesForType(radar, 'monitor'), radar.monitor);
    assert.equal(changesForType(radar, 'all'), radar.changes.items);
  });

  test('applyChangeFilters sin filtros adicionales devuelve el array de tipo completo, mismo orden', () => {
    assert.deepEqual(applyChangeFilters(radar, { type: 'all' }), [aceites, soja, ganaderia]);
  });

  test('applyChangeFilters combina tipo + actividad', () => {
    assert.deepEqual(applyChangeFilters(radar, { type: 'all', activityId: 'cultivo-soja' }), [soja]);
  });

  test('applyChangeFilters combina tipo + relevancia', () => {
    assert.deepEqual(applyChangeFilters(radar, { type: 'all', relevanceLevel: 'low' }), [soja, ganaderia]);
  });

  test('applyChangeFilters con actividad que no está en el tipo elegido da vacío (nunca busca en otro array)', () => {
    assert.deepEqual(applyChangeFilters(radar, { type: 'risk', activityId: 'cultivo-soja' }), []);
  });

  test('applyChangeFilters nunca reordena (Array#filter preserva orden)', () => {
    const filtered = applyChangeFilters(radar, { type: 'all', relevanceLevel: 'low' });
    assert.deepEqual(filtered.map((i) => i.activity_id), ['cultivo-soja', 'ganaderia-bovina-carne']); // mismo orden que changes.items, no alfabético ni por relevancia
  });
});

describe('filterSituations / filterRecommendations', () => {
  const radar = buildRadarFixture();

  test('filterSituations por actividad usa activity_ids.includes, no igualdad exacta', () => {
    assert.equal(filterSituations(radar.situations.items, { activityId: 'cultivo-soja' }).length, 1);
    assert.equal(filterSituations(radar.situations.items, { activityId: 'actividad-inexistente' }).length, 0);
  });

  test('filterSituations por relevancia', () => {
    assert.equal(filterSituations(radar.situations.items, { relevanceLevel: 'high' }).length, 1);
    assert.equal(filterSituations(radar.situations.items, { relevanceLevel: 'low' }).length, 0);
  });

  test('sin filtros, filterSituations/filterRecommendations devuelven todo sin tocar el orden', () => {
    assert.deepEqual(filterSituations(radar.situations.items, {}), radar.situations.items);
    assert.deepEqual(filterRecommendations(radar.recommendations, {}), radar.recommendations);
  });

  test('filterRecommendations por actividad', () => {
    const filtered = filterRecommendations(radar.recommendations, { activityId: 'cultivo-soja' });
    assert.deepEqual(filtered.map((r) => r.id), ['r2', 'r-huerfana']);
  });
});

describe('resolveMemberDirection', () => {
  const radar = buildRadarFixture();

  test('con signal_id coincidente en changes.items, devuelve la dirección real de esa señal', () => {
    assert.equal(resolveMemberDirection({ activity_id: 'elaboracion-aceites', signal_id: 's1' }, radar.changes.items), 'increase');
  });

  test('sin coincidencia (miembro de una situación cuya señal ya no está vigente), devuelve null - nunca inventa una dirección', () => {
    assert.equal(resolveMemberDirection({ activity_id: 'ganaderia-bovina-carne', signal_id: 's-otra' }, radar.changes.items), null);
  });
});

describe('findDecisionForRecommendation', () => {
  const radar = buildRadarFixture();

  test('con decision_id real presente en changes.items, resuelve el item/intel/decision exactos', () => {
    const found = findDecisionForRecommendation(radar.recommendations[0], radar.changes.items);
    assert.ok(found);
    assert.equal(found.decision.id, 'd1');
    assert.equal(found.item.activity_id, 'elaboracion-aceites');
  });

  test('con decision_id que no existe en ningún item vigente, devuelve null - nunca fabrica un vínculo (GAP 17.7)', () => {
    const found = findDecisionForRecommendation(radar.recommendations[2], radar.changes.items);
    assert.equal(found, null);
  });
});

// QA Paso 2D-3: defecto real encontrado y corregido - cambiar cualquier
// filtro reconstruye el árbol de la pantalla desde cero (sin diffing) y eso
// colapsaba cualquier <details> ya expandido. changeItemKey()/situationKey()
// son las claves estables que pages/radar.js usa para restaurar ese estado
// tras el re-render - deben ser únicas por item real y estables entre
// llamadas con el MISMO item (no dependen de Math.random ni de un contador).
describe('changeItemKey / situationKey (QA 2D-3 - claves estables para preservar <details> abiertos entre filtros)', () => {
  const radar = buildRadarFixture();

  test('changeItemKey es estable para el mismo item (mismo resultado en 2 llamadas)', () => {
    assert.equal(changeItemKey(aceites), changeItemKey(aceites));
  });

  test('changeItemKey distingue items de distinta actividad aunque compartan señal', () => {
    assert.notEqual(changeItemKey(aceites), changeItemKey(soja)); // misma signal_id 's1', distinta activity_id
  });

  test('changeItemKey nunca lanza con signal ausente (dato incompleto - robustez)', () => {
    assert.doesNotThrow(() => changeItemKey({ activity_id: 'x', signal: undefined }));
  });

  test('situationKey es estable y distingue situaciones distintas', () => {
    const sit = radar.situations.items[0];
    assert.equal(situationKey(sit), situationKey(sit));
    assert.notEqual(situationKey(sit), situationKey({ ...sit, id: 'otra-situacion' }));
  });
});
