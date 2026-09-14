// Lógica pura de Informes (Paso 2E-2), sin DOM. Verifica el catálogo estático
// de 7 tipos, el armado de params reales de POST /reports/generate, la
// validación de presencia y la estrategia de clasificación de errores
// (contrato §21/§24 - GAP 21.1: 500 en vez de 400 para validaciones).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/services/api.js';
import {
  REPORT_TYPES,
  reportTypeById,
  buildGenerateParams,
  validateConfig,
  isKnownGenerateValidationMessage,
  classifyGenerateError,
  sectionClaims,
  isSectionEmpty,
  SECTION_KEYS,
  SECTION_LABEL,
  SECTION_EMPTY_TEXT,
} from '../src/utils/reports.js';

describe('REPORT_TYPES - catálogo estático de los 7 tipos reales (contrato-informes.md §4)', () => {
  test('tiene exactamente 7 tipos, con los ids reales del backend', () => {
    assert.equal(REPORT_TYPES.length, 7);
    assert.deepEqual(
      REPORT_TYPES.map((t) => t.id).sort(),
      ['executive', 'market', 'opportunity', 'periodic', 'personalized', 'risk', 'sectorial'].sort()
    );
  });

  test('cada tipo tiene nombre, finalidad y qué necesita, en lenguaje llano (sin términos internos)', () => {
    for (const t of REPORT_TYPES) {
      assert.equal(typeof t.name, 'string');
      assert.equal(typeof t.purpose, 'string');
      assert.equal(typeof t.needs, 'string');
      for (const forbidden of ['activityId', 'scope', 'selectScope', 'report_id', 'claim_id']) {
        assert.ok(!t.purpose.includes(forbidden) && !t.needs.includes(forbidden), `${t.id}: no debe exponer '${forbidden}' en texto de usuario`);
      }
    }
  });

  test('solo periodic está deshabilitado (GAP-UX-1) y trae un motivo explícito', () => {
    const disabled = REPORT_TYPES.filter((t) => t.disabled);
    assert.deepEqual(disabled.map((t) => t.id), ['periodic']);
    assert.ok(disabled[0].disabledReason.length > 0);
  });

  test('reportTypeById encuentra un tipo real y devuelve null para uno inexistente', () => {
    assert.equal(reportTypeById('sectorial').name, 'Informe sectorial');
    assert.equal(reportTypeById('no-existe'), null);
  });
});

describe('buildGenerateParams - arma exactamente el shape real de cada selectScope()', () => {
  test('sectorial', () => {
    assert.deepEqual(buildGenerateParams('sectorial', { activityId: 'cultivo-soja' }), { type: 'sectorial', activityId: 'cultivo-soja' });
  });

  test('market sin actividades opcionales', () => {
    assert.deepEqual(buildGenerateParams('market', { marketId: 'china' }), { type: 'market', marketId: 'china' });
  });

  test('market con actividades opcionales', () => {
    assert.deepEqual(buildGenerateParams('market', { marketId: 'china', activityIds: ['cultivo-soja'] }), { type: 'market', marketId: 'china', activityIds: ['cultivo-soja'] });
  });

  test('risk/opportunity sin actividades -> nunca envía activityIds vacío', () => {
    assert.deepEqual(buildGenerateParams('risk', {}), { type: 'risk' });
    assert.deepEqual(buildGenerateParams('opportunity', { activityIds: [] }), { type: 'opportunity' });
  });

  test('personalized', () => {
    assert.deepEqual(buildGenerateParams('personalized', { profileId: 'p1' }), { type: 'personalized', profileId: 'p1' });
  });

  test('executive con perfil vs. síntesis general', () => {
    assert.deepEqual(buildGenerateParams('executive', { useProfile: true, profileId: 'p1' }), { type: 'executive', profileId: 'p1' });
    assert.deepEqual(buildGenerateParams('executive', { useProfile: false }), { type: 'executive' });
  });

  test('periodic (deshabilitado en V1) lanza en vez de armar un params ficticio', () => {
    assert.throws(() => buildGenerateParams('periodic', {}), /no tiene generación soportada/);
  });
});

describe('validateConfig - solo verifica presencia, nunca reglas de negocio', () => {
  test('sectorial requiere activityId', () => {
    assert.equal(validateConfig('sectorial', {}).valid, false);
    assert.equal(validateConfig('sectorial', { activityId: 'x' }).valid, true);
  });

  test('market requiere marketId, actividades siempre opcionales', () => {
    assert.equal(validateConfig('market', {}).valid, false);
    assert.equal(validateConfig('market', { marketId: 'china' }).valid, true);
  });

  test('risk/opportunity siempre válidos sin nada configurado', () => {
    assert.equal(validateConfig('risk', {}).valid, true);
    assert.equal(validateConfig('opportunity', {}).valid, true);
  });

  test('personalized requiere profileId', () => {
    assert.equal(validateConfig('personalized', {}).valid, false);
    assert.equal(validateConfig('personalized', { profileId: 'p1' }).valid, true);
  });

  test('executive: solo requiere profileId si useProfile=true', () => {
    assert.equal(validateConfig('executive', { useProfile: false }).valid, true);
    assert.equal(validateConfig('executive', { useProfile: true }).valid, false);
    assert.equal(validateConfig('executive', { useProfile: true, profileId: 'p1' }).valid, true);
  });
});

describe('isKnownGenerateValidationMessage / classifyGenerateError (GAP 21.1, arquitectura-informes-ux.md §24)', () => {
  test('reconoce los prefijos reales de cada selectScope()', () => {
    assert.ok(isKnownGenerateValidationMessage('reporte sectorial: activityId es obligatorio'));
    assert.ok(isKnownGenerateValidationMessage('reporte de mercado: marketId es obligatorio'));
    assert.ok(isKnownGenerateValidationMessage('reporte periódico: monitorId, field, periodStart y periodEnd son obligatorios'));
    assert.ok(isKnownGenerateValidationMessage('reporte personalizado: profileId es obligatorio'));
    assert.ok(isKnownGenerateValidationMessage('reporte ejecutivo: perfil desconocido \'x\''));
    assert.ok(isKnownGenerateValidationMessage("generateReport: tipo de reporte desconocido 'no-existe'"));
  });

  test('no reconoce un mensaje arbitrario ni vacío/null', () => {
    assert.equal(isKnownGenerateValidationMessage('algo totalmente distinto'), false);
    assert.equal(isKnownGenerateValidationMessage(null), false);
    assert.equal(isKnownGenerateValidationMessage(undefined), false);
  });

  test('classifyGenerateError: 400 real -> validation', () => {
    assert.equal(classifyGenerateError(new ApiError('body.type es obligatorio', { status: 400 })), 'validation');
  });

  test('classifyGenerateError: 500 con mensaje conocido -> validation (GAP 21.1, nunca oculto, solo reclasificado en presentación)', () => {
    assert.equal(classifyGenerateError(new ApiError('reporte sectorial: activityId es obligatorio', { status: 500 })), 'validation');
  });

  test('classifyGenerateError: 500 sin patrón reconocido -> server (nunca se disfraza un 500 real)', () => {
    assert.equal(classifyGenerateError(new ApiError('Cannot read property of undefined', { status: 500 })), 'server');
  });

  test('classifyGenerateError: error de red (status null) -> network', () => {
    assert.equal(classifyGenerateError(new ApiError('No se pudo contactar al backend', { status: null })), 'network');
  });

  test('classifyGenerateError: 404 -> server (no hay caso de negocio real para 404 en generate)', () => {
    assert.equal(classifyGenerateError(new ApiError('x', { status: 404 })), 'server');
  });
});

describe('sectionClaims / isSectionEmpty / SECTION_KEYS/LABEL/EMPTY_TEXT', () => {
  test('sectionClaims devuelve [] cuando la sección trae el marcador vacío (contrato §7)', () => {
    assert.deepEqual(sectionClaims({ risks: { no_relevant_information: true, claims: [] } }, 'risks'), []);
  });

  test('sectionClaims devuelve los claims reales cuando existen', () => {
    const claims = [{ id: '1' }];
    assert.deepEqual(sectionClaims({ risks: { claims } }, 'risks'), claims);
  });

  test('sectionClaims nunca lanza si la sección no existe (robustez ante datos incompletos)', () => {
    assert.deepEqual(sectionClaims({}, 'risks'), []);
  });

  test('isSectionEmpty coherente con sectionClaims', () => {
    assert.equal(isSectionEmpty({ risks: { claims: [] } }, 'risks'), true);
    assert.equal(isSectionEmpty({ risks: { claims: [{ id: '1' }] } }, 'risks'), false);
  });

  test('SECTION_KEYS/SECTION_LABEL/SECTION_EMPTY_TEXT están completos y son consistentes entre sí', () => {
    assert.equal(SECTION_KEYS.length, 8);
    for (const key of SECTION_KEYS) {
      assert.ok(SECTION_LABEL[key], `falta SECTION_LABEL para '${key}'`);
      assert.ok(SECTION_EMPTY_TEXT[key], `falta SECTION_EMPTY_TEXT para '${key}'`);
    }
  });
});
