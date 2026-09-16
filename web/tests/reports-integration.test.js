// Integración real (Paso 2F-2): backend real como proceso hijo, SQLite en
// memoria, puerto dedicado (distinto de profile-integration=3999 y
// situation-integration=3998). Genera un informe REAL (personalized, sobre
// el mismo perfil ABC ya usado en el resto de la suite) vía POST
// /reports/generate llamado directamente por fetch (igual que
// runPipelineFixture en situation-integration.test.js - ese endpoint no
// forma parte de api.js en esta etapa, ver services/api.js, por restricción
// explícita del enunciado de 2F-2), y verifica api.getReport()/
// getReportTraceability() (las 2 únicas funciones que SÍ se agregaron).
//
// También verifica, con datos reales (no supuestos), el hallazgo de
// contrato de esta etapa: un claim type=decision/recommendation NO expone
// alternatives[]/type como campos propios - solo `text` ya redactado.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as api from '../src/services/api.js';
import { ApiError } from '../src/services/api.js';
import { isDirectRelation } from '../src/utils/decision-recommendation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, '..', '..', 'backend');
const PORT = 3997;
const baseUrl = `http://127.0.0.1:${PORT}`;

let backendProcess;

async function waitForBackend(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      /* aún no está listo */
    }
    await delay(150);
  }
  throw new Error('el backend real no respondió a tiempo para la prueba de integración');
}

async function runPipelineFixture(file, extra = {}) {
  const res = await fetch(`${baseUrl}/pipeline/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'fixture',
      jobs: [{ monitorId: 'fao-giews-amis::principal', fixtureFile: file, context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', topicId: 'precios', kind: 'indicator', ...extra } }],
    }),
  });
  if (!res.ok) throw new Error(`pipeline/run falló: ${res.status} ${await res.text()}`);
  return res.json();
}

async function generateReport(type, params) {
  const res = await fetch(`${baseUrl}/reports/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...params }),
  });
  if (!res.ok) throw new Error(`reports/generate falló: ${res.status} ${await res.text()}`);
  return res.json();
}

describe('Integración real: Informes (GET /reports/:id, GET /reports/:id/traceability vía services/api.js)', () => {
  before(async () => {
    backendProcess = spawn(process.execPath, ['server.js'], {
      cwd: BACKEND_DIR,
      env: { ...process.env, PORT: String(PORT), DB_PATH: ':memory:', NODE_ENV: 'test' },
      stdio: 'ignore',
    });
    await waitForBackend();
  });

  after(() => {
    backendProcess?.kill();
  });

  test('informe personalizado real: claims de decisión/recomendación NO exponen alternatives[]/type propios (hallazgo de contrato de esta etapa)', async () => {
    const opts = { baseUrl };

    await runPipelineFixture('soja-precio.t1.json');
    await runPipelineFixture('soja-precio.t2.json');

    const profileRes = await fetch(`${baseUrl}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Informes - perfil ABC (test real)', main_activity_id: 'ganaderia-bovina-carne' }),
    });
    const profile = await profileRes.json();
    await fetch(`${baseUrl}/profiles/${profile.id}/activities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ main_activity_id: 'ganaderia-bovina-carne', secondary_activity_ids: ['cultivo-soja', 'elaboracion-aceites'] }),
    });

    const generated = await generateReport('personalized', { profileId: profile.id });

    const report = await api.getReport(generated.id, opts);
    assert.equal(report.type, 'personalized');
    assert.ok(Array.isArray(report.body.decisions.claims));
    assert.ok(Array.isArray(report.body.recommendations.claims));

    const decisionClaim = report.body.decisions.claims[0];
    assert.ok(decisionClaim, 'debe existir al menos un claim de decisión con el perfil ABC real');
    assert.equal(decisionClaim.alternatives, undefined, 'el claim de decisión NO expone alternatives[] - confirmado con datos reales, no supuesto');
    assert.equal(decisionClaim.decision_type, undefined, 'tampoco expone decision_type como campo propio');
    assert.ok(typeof decisionClaim.text === 'string' && decisionClaim.text.length > 0, 'el texto ya redactado SÍ está disponible');

    const recommendationClaim = report.body.recommendations.claims[0];
    assert.ok(recommendationClaim, 'debe existir al menos un claim de recomendación con el perfil ABC real');
    assert.equal(recommendationClaim.type, 'recommendation', 'claim.type es siempre el tipo de CLAIM, no el tipo real de la recomendación (mitigate/monitor/...)');
    assert.equal(recommendationClaim.references.recommendation_id !== undefined, true);
    // el campo real recommendation.decision_id (el que permitiría comprobar
    // la relación directa) no llega al claim - solo references.decision_id
    // (la decisión bajo la que el backend la anidó, no necesariamente su
    // origen verificado) - por eso el vínculo en Informes siempre debe usar
    // lenguaje contextual (ver pages/informes.js#renderRecommendationClaim).
    assert.equal(isDirectRelation(null, { decision_id: null }), false);

    const traceability = await api.getReportTraceability(generated.id, opts);
    assert.equal(traceability.report_id, generated.id);
    assert.ok(Array.isArray(traceability.traceability));
    assert.ok(traceability.traceability.length >= report.claims.length - 5, 'la trazabilidad cubre (aprox.) los claims reales del informe');
  });

  test('informe inexistente -> ApiError 404 (no una excepción genérica)', async () => {
    await assert.rejects(() => api.getReport('00000000-0000-0000-0000-000000000000', { baseUrl }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      return true;
    });
  });
});
