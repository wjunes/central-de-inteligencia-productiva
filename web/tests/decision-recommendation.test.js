// Lógica pura de la relación decisión -> recomendación (GAP 17.7, Paso
// 2F-2/Fase 6) - sin DOM, comprobable directamente. Es la regla más
// sensible de esta etapa (nunca afirmar más vínculo del que el dato
// permite comprobar), por eso tiene su propio archivo de pruebas dedicado.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isDirectRelation, relationLabel, findDecisionForRecommendation, resolveMemberDirection } from '../src/utils/decision-recommendation.js';

describe('isDirectRelation()', () => {
  test('true solo cuando decisionId === recommendation.decision_id', () => {
    assert.equal(isDirectRelation('d1', { decision_id: 'd1' }), true);
  });

  test('false cuando los ids difieren (caso real verificado en 2F-0: reuso de una recomendación de una decisión anterior)', () => {
    assert.equal(isDirectRelation('d2', { decision_id: 'd1' }), false);
  });

  test('false cuando falta cualquiera de los dos ids - nunca se asume relación por ausencia de dato', () => {
    assert.equal(isDirectRelation(null, { decision_id: 'd1' }), false);
    assert.equal(isDirectRelation('d1', { decision_id: null }), false);
    assert.equal(isDirectRelation('d1', null), false);
    assert.equal(isDirectRelation(null, null), false);
  });
});

describe('relationLabel()', () => {
  test('lenguaje directo únicamente si la relación es directa', () => {
    assert.equal(relationLabel(true), 'Recomendación derivada de esta decisión');
  });

  test('lenguaje contextual (nunca "generada por") si no es directa', () => {
    const label = relationLabel(false);
    assert.equal(label, 'Recomendación vigente para esta actividad');
    assert.ok(!/generó|generada por|decidió/i.test(label));
  });
});

describe('findDecisionForRecommendation()', () => {
  const changeItems = [
    {
      activity_id: 'elaboracion-aceites',
      intelligence: [{ decisions: [{ id: 'd-vieja', recommendation: null }] }],
    },
    {
      activity_id: 'cultivo-soja',
      intelligence: [{ decisions: [{ id: 'd-nueva', recommendation: { id: 'r1', decision_id: 'd-nueva' } }] }],
    },
  ];

  test('encuentra la decisión cuyo id coincide con recommendation.decision_id, en cualquier item del payload', () => {
    const found = findDecisionForRecommendation({ id: 'r1', decision_id: 'd-nueva' }, changeItems);
    assert.equal(found?.id, 'd-nueva');
  });

  test('devuelve null si ninguna decisión del payload actual coincide (reproduce el caso real de 2F-0: la decisión de origen ya no es "relevante" y no aparece en changes.items)', () => {
    const found = findDecisionForRecommendation({ id: 'r-huerfana', decision_id: 'd-de-otra-corrida' }, changeItems);
    assert.equal(found, null);
  });

  test('nunca infiere por actividad/topic - una recomendación de una actividad sin decisión coincidente da null aunque haya otras decisiones en esa misma actividad', () => {
    const found = findDecisionForRecommendation({ id: 'rX', decision_id: 'no-existe' }, changeItems);
    assert.equal(found, null);
  });
});

describe('resolveMemberDirection()', () => {
  const changeItems = [{ signal: { id: 'sig-1', direction: 'increase' } }, { signal: { id: 'sig-2', direction: 'decrease' } }];

  test('resuelve por cruce de signal_id en memoria, sin llamada adicional', () => {
    assert.equal(resolveMemberDirection({ signal_id: 'sig-2' }, changeItems), 'decrease');
  });

  test('null si el signal_id del miembro no está en el payload actual (nunca inventa una dirección)', () => {
    assert.equal(resolveMemberDirection({ signal_id: 'sig-no-existe' }, changeItems), null);
  });
});
