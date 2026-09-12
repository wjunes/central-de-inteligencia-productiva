import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadActiveProfileId, saveActiveProfileId, clearActiveProfileId } from '../src/state/active-profile.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

describe('active-profile - recuerda qué perfil ve este dispositivo (sin autenticación)', () => {
  test('sin nada guardado, devuelve null', () => {
    assert.equal(loadActiveProfileId(fakeStorage()), null);
  });

  test('guardar y volver a cargar devuelve el mismo id', () => {
    const storage = fakeStorage();
    saveActiveProfileId('perfil-123', storage);
    assert.equal(loadActiveProfileId(storage), 'perfil-123');
  });

  test('clear elimina el id guardado', () => {
    const storage = fakeStorage({ 'cip:active-profile-id': 'perfil-123' });
    clearActiveProfileId(storage);
    assert.equal(loadActiveProfileId(storage), null);
  });

  test('storage que lanza excepción no rompe la aplicación', () => {
    const throwingStorage = {
      getItem() { throw new Error('bloqueado'); },
      setItem() { throw new Error('bloqueado'); },
      removeItem() { throw new Error('bloqueado'); },
    };
    assert.equal(loadActiveProfileId(throwingStorage), null);
    assert.doesNotThrow(() => saveActiveProfileId('x', throwingStorage));
    assert.doesNotThrow(() => clearActiveProfileId(throwingStorage));
  });
});
