// Recuerda que perfil esta viendo este dispositivo (no hay autenticacion en
// esta etapa - prompt seccion 24). Es una conveniencia de dispositivo, igual
// que state/theme.js: nunca se envia al backend, no es un dato de dominio.
const STORAGE_KEY = 'cip:active-profile-id';

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadActiveProfileId(storage = null) {
  const store = safeStorage(storage);
  try {
    return store?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveActiveProfileId(id, storage = null) {
  const store = safeStorage(storage);
  try {
    store?.setItem(STORAGE_KEY, id);
  } catch {
    /* almacenamiento no disponible - la sesion sigue funcionando, solo no persiste */
  }
}

export function clearActiveProfileId(storage = null) {
  const store = safeStorage(storage);
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
