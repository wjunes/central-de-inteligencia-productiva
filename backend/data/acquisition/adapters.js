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

function hashOf(value) {
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

// --- Adaptadores con interfaz definida, implementacion minima (no requeridos
// por los casos de prueba de esta etapa, ver README de _build) ---
async function apiSoap() {
  return { status: 'acquisition_error', error: 'api_soap: adaptador con interfaz definida, sin implementacion real en esta etapa (ver backend/README.md).' };
}
async function feed() {
  return { status: 'acquisition_error', error: 'feed: adaptador con interfaz definida, sin implementacion real en esta etapa.' };
}
async function fileDownload() {
  return { status: 'acquisition_error', error: 'file_download: adaptador con interfaz definida, sin implementacion real en esta etapa.' };
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
