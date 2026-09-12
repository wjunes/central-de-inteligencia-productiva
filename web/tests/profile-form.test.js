// Logica pura del formulario de Perfil Productivo (sin DOM). Cubre la parte
// mas delicada del Paso 2B: preservar selecciones de OTRAS actividades al
// reemplazar la lista completa de productos/insumos (PUT reemplaza todo el
// conjunto - backend/core/profile/store.js#setProducts/setInputs).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActivityOptions,
  sanitizeSecondaryActivities,
  toggleRamificationSelection,
  selectedRamificationIds,
  addPriority,
  removePriority,
  movePriority,
  addConstraint,
  removeConstraintAt,
  humanizeSlug,
  describeApiError,
} from '../src/utils/profile-form.js';
import { ApiError } from '../src/services/api.js';

const CATALOG = {
  activities: {
    sectors: [{ id: 'agropecuario', name: 'Agropecuario', order: 1 }],
    items: [
      { id: 'ganaderia', name: 'Ganadería', sector_id: 'agropecuario', level: 'activity', parent_id: null, subactivities: ['ganaderia-bovina-carne'] },
      { id: 'ganaderia-bovina-carne', name: 'Ganadería bovina de carne', sector_id: 'agropecuario', level: 'subactivity', parent_id: 'ganaderia', subactivities: [] },
      { id: 'cultivo-soja', name: 'Cultivo de soja', sector_id: 'agropecuario', level: 'activity', parent_id: null, subactivities: [] },
    ],
  },
};

describe('buildActivityOptions - jerarquía sector/actividad/subactividad', () => {
  test('incluye el sector en la etiqueta (nunca separa la jerarquía en conceptos independientes)', () => {
    const options = buildActivityOptions(CATALOG);
    const soja = options.find((o) => o.id === 'cultivo-soja');
    assert.equal(soja.label, 'Agropecuario · Cultivo de soja');
  });

  test('una subactividad muestra su actividad padre en la etiqueta', () => {
    const options = buildActivityOptions(CATALOG);
    const bovina = options.find((o) => o.id === 'ganaderia-bovina-carne');
    assert.equal(bovina.label, 'Agropecuario · Ganadería → Ganadería bovina de carne');
  });

  test('excludeId nunca aparece en el resultado', () => {
    const options = buildActivityOptions(CATALOG, 'cultivo-soja');
    assert.ok(!options.some((o) => o.id === 'cultivo-soja'));
  });
});

describe('sanitizeSecondaryActivities - la principal nunca es también secundaria', () => {
  test('filtra la actividad principal de la lista de secundarias', () => {
    assert.deepEqual(sanitizeSecondaryActivities('cultivo-soja', ['ganaderia', 'cultivo-soja']), ['ganaderia']);
  });
  test('lista sin conflicto queda intacta', () => {
    assert.deepEqual(sanitizeSecondaryActivities('cultivo-soja', ['ganaderia']), ['ganaderia']);
  });
});

describe('toggleRamificationSelection - reemplazo completo preservando OTRAS actividades', () => {
  test('marcar un producto lo agrega sin tocar selecciones de otra actividad', () => {
    const current = [{ activity_id: 'ganaderia', ramification_id: 'carne-bovina' }];
    const next = toggleRamificationSelection(current, 'cultivo-soja', 'soja', true);
    assert.deepEqual(next, [
      { activity_id: 'ganaderia', ramification_id: 'carne-bovina' },
      { activity_id: 'cultivo-soja', ramification_id: 'soja' },
    ]);
  });

  test('desmarcar quita solo esa entrada exacta, preservando el resto', () => {
    const current = [
      { activity_id: 'ganaderia', ramification_id: 'carne-bovina' },
      { activity_id: 'cultivo-soja', ramification_id: 'soja' },
    ];
    const next = toggleRamificationSelection(current, 'cultivo-soja', 'soja', false);
    assert.deepEqual(next, [{ activity_id: 'ganaderia', ramification_id: 'carne-bovina' }]);
  });

  test('no duplica si ya estaba marcado (idempotente)', () => {
    const current = [{ activity_id: 'cultivo-soja', ramification_id: 'soja' }];
    const next = toggleRamificationSelection(current, 'cultivo-soja', 'soja', true);
    assert.deepEqual(next, [{ activity_id: 'cultivo-soja', ramification_id: 'soja' }]);
  });

  test('selectedRamificationIds filtra por actividad', () => {
    const list = [
      { activity_id: 'ganaderia', ramification_id: 'carne-bovina' },
      { activity_id: 'cultivo-soja', ramification_id: 'soja' },
    ];
    assert.deepEqual(selectedRamificationIds(list, 'cultivo-soja'), ['soja']);
    assert.deepEqual(selectedRamificationIds(list, 'ganaderia'), ['carne-bovina']);
  });
});

describe('prioridades - rank siempre es posición, nunca un score inventado', () => {
  test('addPriority agrega al final con rank = length+1', () => {
    const next = addPriority([{ topic_id: 'demanda', rank: 1 }], 'precios');
    assert.deepEqual(next, [{ topic_id: 'demanda', rank: 1 }, { topic_id: 'precios', rank: 2 }]);
  });

  test('addPriority no duplica un tema ya priorizado', () => {
    const next = addPriority([{ topic_id: 'demanda', rank: 1 }], 'demanda');
    assert.deepEqual(next, [{ topic_id: 'demanda', rank: 1 }]);
  });

  test('removePriority recalcula ranks contiguos', () => {
    const list = [{ topic_id: 'a', rank: 1 }, { topic_id: 'b', rank: 2 }, { topic_id: 'c', rank: 3 }];
    assert.deepEqual(removePriority(list, 'b'), [{ topic_id: 'a', rank: 1 }, { topic_id: 'c', rank: 2 }]);
  });

  test('movePriority sube un elemento e intercambia rank', () => {
    const list = [{ topic_id: 'a', rank: 1 }, { topic_id: 'b', rank: 2 }];
    assert.deepEqual(movePriority(list, 1, -1), [{ topic_id: 'b', rank: 1 }, { topic_id: 'a', rank: 2 }]);
  });

  test('movePriority en el límite no cambia nada', () => {
    const list = [{ topic_id: 'a', rank: 1 }, { topic_id: 'b', rank: 2 }];
    assert.deepEqual(movePriority(list, 0, -1), list);
  });
});

describe('restricciones', () => {
  test('addConstraint agrega con description null si no se especifica', () => {
    const next = addConstraint([], { category: 'regulatory', severity: 'soft_constraint' });
    assert.deepEqual(next, [{ category: 'regulatory', severity: 'soft_constraint', description: null }]);
  });

  test('removeConstraintAt quita por índice', () => {
    const list = [{ category: 'a' }, { category: 'b' }];
    assert.deepEqual(removeConstraintAt(list, 0), [{ category: 'b' }]);
  });
});

describe('humanizeSlug - formateo tipográfico, no invención de datos', () => {
  test('reemplaza guiones y capitaliza cada palabra', () => {
    assert.equal(humanizeSlug('reino-unido'), 'Reino Unido');
    assert.equal(humanizeSlug('brasil'), 'Brasil');
    assert.equal(humanizeSlug('estados-unidos'), 'Estados Unidos');
  });
});

describe('describeApiError - nunca expone detalles internos crudos', () => {
  test('error de red', () => {
    assert.equal(describeApiError(new ApiError('x', { status: null })), 'No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.');
  });
  test('404', () => {
    assert.equal(describeApiError(new ApiError('x', { status: 404 })), 'El recurso solicitado no existe.');
  });
  test('400 conserva el mensaje humano del backend (ValidationError)', () => {
    assert.equal(describeApiError(new ApiError('activity_id desconocido', { status: 400 })), 'activity_id desconocido');
  });
  test('500 no expone el mensaje interno crudo', () => {
    assert.equal(describeApiError(new ApiError('Error: ENOENT at /internal/path', { status: 500 })), 'Ocurrió un error inesperado al comunicarse con el servidor.');
  });
  test('error no-ApiError también queda genérico', () => {
    assert.equal(describeApiError(new TypeError('boom')), 'Ocurrió un error inesperado.');
  });
});
