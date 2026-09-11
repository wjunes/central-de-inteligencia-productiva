// Logica pura de state/theme.js, con storage/root inyectados (sin depender
// de localStorage/document reales - node:test no tiene navegador).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeThemePreference, loadThemePreference, saveThemePreference, applyThemePreference } from '../src/state/theme.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

function fakeRoot() {
  const attrs = new Map();
  return {
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
  };
}

describe('theme - normalizacion', () => {
  test('valores validos pasan sin cambios', () => {
    assert.equal(normalizeThemePreference('light'), 'light');
    assert.equal(normalizeThemePreference('dark'), 'dark');
    assert.equal(normalizeThemePreference('system'), 'system');
  });

  test('valor invalido/ausente cae a "system"', () => {
    assert.equal(normalizeThemePreference('violeta'), 'system');
    assert.equal(normalizeThemePreference(undefined), 'system');
    assert.equal(normalizeThemePreference(null), 'system');
  });
});

describe('theme - persistencia', () => {
  test('sin preferencia guardada, carga "system"', () => {
    assert.equal(loadThemePreference(fakeStorage()), 'system');
  });

  test('guardar y volver a cargar preserva la preferencia explicita', () => {
    const storage = fakeStorage();
    const saved = saveThemePreference('dark', storage);
    assert.equal(saved, 'dark');
    assert.equal(loadThemePreference(storage), 'dark');
  });

  test('storage que lanza excepcion no rompe la aplicacion (cae a "system")', () => {
    const throwingStorage = {
      getItem() { throw new Error('bloqueado'); },
      setItem() { throw new Error('bloqueado'); },
    };
    assert.equal(loadThemePreference(throwingStorage), 'system');
    assert.equal(saveThemePreference('dark', throwingStorage), 'dark'); // no lanza, solo no persiste
  });
});

describe('theme - aplicacion (nunca inversion global, ver themes.css)', () => {
  test('"system" remueve el atributo (CSS decide via prefers-color-scheme, sin JS)', () => {
    const root = fakeRoot();
    root.setAttribute('data-theme', 'dark');
    applyThemePreference('system', root);
    assert.equal(root.getAttribute('data-theme'), null);
  });

  test('"dark"/"light" explicitos fuerzan el atributo', () => {
    const root = fakeRoot();
    applyThemePreference('dark', root);
    assert.equal(root.getAttribute('data-theme'), 'dark');
    applyThemePreference('light', root);
    assert.equal(root.getAttribute('data-theme'), 'light');
  });
});
