// Servicio de busqueda web - desacoplado, DESHABILITADO por defecto (prompt
// seccion 25). No se ejecuta ninguna busqueda automatica; el pipeline
// deterministico no lo importa. Solo se activaria cuando un source/resource
// de knowledge/sources/ lo requiera explicitamente y la metodologia lo permita.
export async function webSearch(query, { enabled = false } = {}) {
  if (!enabled) {
    return { skipped: true, reason: 'web_search deshabilitado por defecto (prompt del motor operativo, sección 25)' };
  }
  throw new Error('webSearch: no implementado en esta etapa - requiere una decisión explícita de habilitación y registro de costo/uso.');
}
