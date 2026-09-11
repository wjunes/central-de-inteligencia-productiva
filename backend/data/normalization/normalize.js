// normalize(): canonicaliza la salida del adaptador para que change-detection
// compare siempre la misma forma de dato, independientemente del adaptador
// de origen (evita que un reordenamiento de claves JSON se lea como cambio).
export function normalize(rawNormalized) {
  if (rawNormalized == null) return null;
  return canonicalize(rawNormalized);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}
