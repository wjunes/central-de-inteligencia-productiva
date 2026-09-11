// Estado de tema: Claro/Oscuro/Sistema (prompt seccion 12/13). Logica pura,
// separada de los efectos de navegador (localStorage/documentElement), para
// que sea comprobable con node:test sin DOM (ver web/tests/theme.test.js).
const STORAGE_KEY = 'cip:theme-preference';
const VALID_PREFERENCES = ['light', 'dark', 'system'];

export function normalizeThemePreference(value) {
  return VALID_PREFERENCES.includes(value) ? value : 'system';
}

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadThemePreference(storage = null) {
  const store = safeStorage(storage);
  try {
    return normalizeThemePreference(store?.getItem(STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function saveThemePreference(preference, storage = null) {
  const normalized = normalizeThemePreference(preference);
  const store = safeStorage(storage);
  try {
    store?.setItem(STORAGE_KEY, normalized);
  } catch {
    /* almacenamiento no disponible (privado/bloqueado) - la preferencia sigue
       aplicandose en esta sesion, simplemente no persiste */
  }
  return normalized;
}

// applyThemePreference: 'system' -> sin atributo (CSS decide via
// prefers-color-scheme, sin ninguna logica JS de por medio); 'light'/'dark'
// -> atributo explicito que gana sobre el sistema operativo (ver
// src/styles/themes.css).
export function applyThemePreference(preference, root = null) {
  const normalized = normalizeThemePreference(preference);
  const target = root ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!target) return normalized;
  if (normalized === 'system') target.removeAttribute('data-theme');
  else target.setAttribute('data-theme', normalized);
  return normalized;
}
