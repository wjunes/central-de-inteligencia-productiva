// Adaptadores de adquisicion - uno por metodo de knowledge/monitoring/methods.json
// (6 adaptadores reutilizables, nunca uno por fuente). Cada adaptador expone
// la misma interfaz: async fetch(monitor, source, params) -> {
//   status, raw, normalized, hash, size_bytes, latency_ms, error
// }
//
// 'fixture' es un septimo adaptador, exclusivo del backend (no existe en
// knowledge/monitoring/), usado por el modo de prueba (prompt seccion 34)
// para no depender de fuentes externas.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from '../../config.js';
import { parseCsvBuffer } from '../parsing/csv.js';

function hashOf(value) {
  if (Buffer.isBuffer(value)) return createHash('sha256').update(value).digest('hex');
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

async function timedFetch(url, options = {}) {
  const start = Date.now();
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(config.acquisitionTimeoutMs) });
  const text = await res.text();
  const latency_ms = Date.now() - start;
  return { res, text, latency_ms };
}

// --- ckan_api: catalogos CKAN (AGESIC, INUMET, INE, BPS, DNA...) ---
async function ckanApi(monitor, source) {
  // Usa resource_url si esta declarado (organizacion en catalogodatos.gub.uy);
  // si no, no se puede resolver automaticamente sin un endpoint explicito.
  const orgUrl = source.access.resource_url;
  if (!orgUrl || !orgUrl.includes('catalogodatos.gub.uy')) {
    return { status: 'acquisition_error', error: 'ckan_api: no se pudo resolver una organizacion CKAN desde sources.json.access.resource_url' };
  }
  const org = orgUrl.split('/organization/')[1];
  const apiUrl = `https://catalogodatos.gub.uy/api/3/action/package_search?fq=organization:${encodeURIComponent(org)}&rows=20`;
  try {
    const { res, text, latency_ms } = await timedFetch(apiUrl);
    if (!res.ok) return { status: 'source_unavailable', error: `HTTP ${res.status}`, latency_ms };
    const json = JSON.parse(text);
    const datasets = (json.result?.results ?? []).map((d) => ({
      name: d.name,
      title: d.title,
      metadata_modified: d.metadata_modified,
      num_resources: d.num_resources,
    }));
    return {
      status: 'ok',
      raw: json,
      normalized: { kind: 'dataset_list', count: datasets.length, datasets },
      hash: hashOf(datasets),
      size_bytes: text.length,
      latency_ms,
    };
  } catch (err) {
    return { status: 'acquisition_error', error: err.message };
  }
}

// --- api_rest_json: APIs REST publicas con JSON ---
async function apiRestJson(monitor, source, params = {}) {
  const url = source.access.endpoint;
  if (!url) return { status: 'acquisition_error', error: 'api_rest_json: sources.json no declara access.endpoint' };
  try {
    const { res, text, latency_ms } = await timedFetch(url + (params.path ?? ''));
    if (!res.ok) return { status: 'source_unavailable', error: `HTTP ${res.status}`, latency_ms };
    const json = JSON.parse(text);
    return {
      status: 'ok',
      raw: json,
      normalized: { kind: 'raw_json', payload: json },
      hash: hashOf(text),
      size_bytes: text.length,
      latency_ms,
    };
  } catch (err) {
    return { status: 'acquisition_error', error: err.message };
  }
}

// --- file_download (Bloque C): descarga la URL declarada explicitamente en
// sources.json.access.endpoint (MISMO campo que ya usa api_rest_json - no se
// inventa un segundo concepto de "URL configurada"; solo cambia que aqui el
// contenido no se interpreta como JSON). No se acepta access.url (pagina
// institucional) como sustituto: si un source no declara access.endpoint,
// significa que todavia no existe una URL de archivo curada y verificable
// para el, y se documenta como tal (regla de esta etapa: no descargar
// archivos arbitrarios ni adivinar la URL real a partir de la pagina web).
//
// El contrato NO parsea binarios (pdf/xlsx/shp/geotiff): esos siguen
// devolviendo solo metadatos (content-type, tamano, hash) como
// normalized.kind='raw_file' - eso no cambia en esta etapa (Bloque E).
//
// Bloque E: cuando la respuesta es CSV (por content-type o extension de la
// URL - nunca por institucion), se interpreta con
// data/parsing/csv.js#parseCsvBuffer() (parser generico, no especifico de
// ninguna fuente), devolviendo normalized.kind='csv_table' con headers/rows
// ya estructurados. NO decide aqui cual columna es "la clave" (record_diff) o
// "el valor" (value_comparison) de ese cambio: esa interpretacion depende de
// curacion por monitor (ver knowledge/monitoring/monitors.json) - dejar esa
// decision sin resolver aca es intencional, no un olvido. Un CSV invalido se
// reporta como acquisition_error (visible, no silencioso), en vez de
// degradar a raw_file.
//
// Bloque J: delimiter/encoding/header_row YA NO se asumen fijos (',',
// UTF-8, primera fila) - se leen de monitor.monitoring_definition (curado
// por evidencia real sobre el archivo, Bloque F/J), con esos mismos valores
// como default para cualquier monitor que no declare la configuracion (todo
// el comportamiento de Bloque E queda intacto para ellos). Nunca se infiere
// delimiter/encoding/header_row del contenido, la institucion o el nombre
// del archivo.
function csvParsingConfig(monitor) {
  const def = monitor.monitoring_definition ?? {};
  return {
    delimiter: def.delimiter ?? ',',
    encoding: def.encoding ?? 'utf-8',
    headerRow: def.header_row ?? 0,
  };
}
function looksLikeCsv(contentType, url) {
  if (contentType && contentType.toLowerCase().includes('csv')) return true;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.csv');
  } catch {
    return false;
  }
}

async function fileDownload(monitor, source) {
  const url = source.access?.endpoint;
  if (!url) {
    return {
      status: 'acquisition_error',
      error: `file_download: sources.json no declara access.endpoint (URL directa de archivo) para '${source.id}' - solo existe access.url de pagina institucional, que no es un archivo descargable. No se descarga una URL no declarada explicitamente para este fin.`,
    };
  }

  const start = Date.now();
  const elapsed = () => Date.now() - start;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(config.acquisitionTimeoutMs) });

    if (!res.ok) {
      await res.body?.cancel?.().catch(() => {});
      return { status: 'source_unavailable', error: `HTTP ${res.status}`, latency_ms: elapsed() };
    }

    const contentType = res.headers.get('content-type') ?? null;
    const declaredLength = Number(res.headers.get('content-length') ?? 0);
    if (declaredLength > config.acquisitionMaxBytes) {
      await res.body?.cancel?.().catch(() => {});
      return { status: 'acquisition_error', error: `file_download: Content-Length declarado (${declaredLength} bytes) supera el limite configurado (${config.acquisitionMaxBytes} bytes)`, latency_ms: elapsed() };
    }

    // Limite real por bytes leidos en streaming (protege tambien respuestas
    // sin Content-Length, p. ej. chunked) - no confiar solo en el header.
    const chunks = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > config.acquisitionMaxBytes) {
          await reader.cancel().catch(() => {});
          return { status: 'acquisition_error', error: `file_download: la descarga supera el limite configurado (${config.acquisitionMaxBytes} bytes) - abortada en curso`, latency_ms: elapsed() };
        }
        chunks.push(Buffer.from(value));
      }
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      return { status: 'acquisition_error', error: 'file_download: contenido vacio', latency_ms: elapsed() };
    }

    if (looksLikeCsv(contentType, url)) {
      let parsed;
      try {
        parsed = parseCsvBuffer(buffer, csvParsingConfig(monitor));
      } catch (err) {
        return { status: 'acquisition_error', error: `file_download: CSV invalido - ${err.message}`, latency_ms: elapsed() };
      }
      return {
        status: 'ok',
        normalized: { kind: 'csv_table', content_type: contentType, headers: parsed.headers, rows: parsed.rows, row_count: parsed.row_count },
        hash: hashOf(buffer),
        size_bytes: buffer.length,
        latency_ms: elapsed(),
      };
    }

    return {
      status: 'ok',
      normalized: { kind: 'raw_file', content_type: contentType, byte_length: buffer.length },
      hash: hashOf(buffer),
      size_bytes: buffer.length,
      latency_ms: elapsed(),
    };
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return { status: 'acquisition_error', error: isTimeout ? `file_download: timeout tras ${config.acquisitionTimeoutMs}ms` : `file_download: ${err.message}` };
  }
}

// --- Adaptadores con interfaz definida, implementacion minima (no requeridos
// por los casos de prueba de esta etapa, ver README de _build) ---
async function apiSoap() {
  return { status: 'acquisition_error', error: 'api_soap: adaptador con interfaz definida, sin implementacion real en esta etapa (ver backend/README.md).' };
}
async function feed() {
  return { status: 'acquisition_error', error: 'feed: adaptador con interfaz definida, sin implementacion real en esta etapa.' };
}
async function manualCapture() {
  return { status: 'acquisition_error', error: 'manual_capture: requiere el flujo de knowledge/monitoring/manual-capture-workflow.json (captura asistida) - no ejecutable automaticamente.' };
}

// --- fixture: exclusivo del backend, lee de disco (modo de prueba) ---
async function fixtureAdapter(monitor, source, params = {}) {
  const { fixturePath } = params;
  if (!fixturePath) return { status: 'acquisition_error', error: 'fixture: falta fixturePath' };
  try {
    const raw = JSON.parse(readFileSync(fixturePath, 'utf-8'));
    return {
      status: 'fixture',
      raw,
      normalized: raw.normalized,
      hash: hashOf(raw.normalized),
      size_bytes: JSON.stringify(raw).length,
      latency_ms: 0,
    };
  } catch (err) {
    return { status: 'acquisition_error', error: err.message };
  }
}

export const adapters = {
  ckan_api: ckanApi,
  api_rest_json: apiRestJson,
  api_soap: apiSoap,
  feed,
  file_download: fileDownload,
  manual_capture: manualCapture,
  fixture: fixtureAdapter,
};
