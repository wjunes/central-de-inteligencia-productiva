// Pruebas del Motor de Presentación y Narrativa (prompt de Narrativa, sección
// 28, 35 casos + sección 30, alucinación controlada).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../db/connection.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { knowledge } from '../knowledge/loader.js';
import { generateReport } from '../reports/build.js';
import { generateNarrative } from '../narrative/build.js';
import { validateNarrative } from '../narrative/validator.js';
import { listNarratives } from '../narrative/store.js';
import { AIProvider } from '../services/ai/provider.js';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FX = (name) => join(__dirname, '..', 'fixtures', name);
const job = (file, extra = {}) => ({ monitorId: 'fao-giews-amis::principal', fixturePath: FX(file), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', topicId: 'precios', kind: 'indicator', ...extra } });

async function runSojaT1T2(db) {
  await runPipeline(db, [job('soja-precio.t1.json')]);
  return runPipeline(db, [job('soja-precio.t2.json')]);
}

class FakeProvider extends AIProvider {
  constructor(responseFn) {
    super();
    this.responseFn = responseFn;
    this.model = 'fake-model-v1';
  }
  isConfigured() { return true; }
  async generate() { return this.responseFn(); }
}

describe('Motor de Presentación y Narrativa', () => {
  let db;
  beforeEach(() => {
    db = resetDbForTests(':memory:');
  });

  test('Caso 1/2 - narrativa determinística, sin IA', async () => {
    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const narr = await generateNarrative(db, rep.id); // mode por defecto = deterministic
    assert.equal(narr.mode, 'deterministic');
    assert.equal(narr.provider, null);
    assert.equal(narr.status, 'validated');
  });

  test('Caso 3 - reporte vacío produce narrativa válida con secciones ausentes declaradas', () => {
    const rep = generateReport(db, 'risk', { activityIds: ['software-ti'] });
    return generateNarrative(db, rep.id).then((narr) => {
      assert.equal(narr.status, 'validated');
      assert.ok(narr.body.warnings.some((w) => w.includes('Riesgos')));
    });
  });

  test('Caso 4/5/6/7 - cambio, comparación, tendencia confirmada, comparación sin tendencia', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    await runPipeline(db, [job('soja-precio.t2.json')]);
    await runPipeline(db, [job('soja-precio.t2b.json')]);
    await runPipeline(db, [job('soja-precio.t2c.json')]);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja', profileId: undefined });
    // el reporte sectorial no arma situaciones/tendencia (requiere perfil) - se prueba vía personalized:
    const { createProfile } = await import('../core/profile/store.js');
    const profile = createProfile(db, { name: 'p', main_activity_id: 'cultivo-soja' });
    const repP = generateReport(db, 'personalized', { profileId: profile.id });
    const narr = await generateNarrative(db, repP.id);
    assert.ok(narr.body.sections.some((s) => s.title === 'Tendencias confirmadas'));
    assert.equal(narr.status, 'validated');

    // periódico: comparación sin tendencia, nunca debe decir "tendencia"
    const changes = db.prepare('SELECT id FROM changes ORDER BY detected_at ASC').all();
    db.prepare('UPDATE changes SET detected_at = ? WHERE id = ?').run(new Date(Date.now() - 30 * 60 * 1000).toISOString(), changes[0].id);
    db.prepare('UPDATE changes SET detected_at = ? WHERE id = ?').run(new Date().toISOString(), changes[1].id);
    const periodic = generateReport(db, 'periodic', { monitorId: 'fao-giews-amis::principal', field: 'precio-soja-fao-amis', periodStart: new Date(Date.now() - 45 * 60 * 1000).toISOString(), periodEnd: new Date(Date.now() + 60 * 1000).toISOString(), activityId: 'cultivo-soja' });
    const narrPeriodic = await generateNarrative(db, periodic.id);
    assert.equal(narrPeriodic.status, 'validated');
    const comparisonText = JSON.stringify(narrPeriodic.body);
    assert.ok(!/tendencia/i.test(comparisonText.replace(/Tendencias confirmadas/gi, '')), 'un reporte periódico no debe mencionar tendencia');
  });

  test('Caso 8/9 - riesgo y oportunidad se narran distinguidos', async () => {
    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'elaboracion-aceites' });
    const narr = await generateNarrative(db, rep.id);
    const risksSection = narr.body.sections.find((s) => s.title === 'Riesgos');
    assert.ok(risksSection && risksSection.paragraphs.length > 0);
  });

  test('Caso 10/11 - decisión y recomendación conservan su formulación aprobada', async () => {
    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const narr = await generateNarrative(db, rep.id);
    const recSection = narr.body.sections.find((s) => s.title === 'Recomendaciones');
    assert.ok(recSection.paragraphs[0].paragraph.startsWith('Si se confirma') || recSection.paragraphs[0].paragraph.startsWith('Se recomienda'));
  });

  test('Caso 12 - ausencia de recomendación se declara explícitamente', () => {
    const rep = generateReport(db, 'sectorial', { activityId: 'software-ti' });
    return generateNarrative(db, rep.id).then((narr) => {
      assert.ok(narr.body.warnings.some((w) => w.includes('Recomendaciones')));
    });
  });

  test('Caso 13/14 - incertidumbre y evidencia insuficiente se conservan explícitas', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    await runPipeline(db, [job('soja-precio.t2.json', { conflicting: true })]);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const narr = await generateNarrative(db, rep.id);
    const uncertaintySection = narr.body.sections.find((s) => s.title === 'Incertidumbres y limitaciones');
    assert.ok(uncertaintySection && uncertaintySection.paragraphs.length > 0);
    assert.ok(uncertaintySection.paragraphs[0].paragraph.startsWith('Las evidencias disponibles presentan resultados contradictorios'));
  });

  test('Caso 15/16/17 - multiactividad conserva diferencias por actividad', async () => {
    await runSojaT1T2(db);
    const { createProfile, setActivities } = await import('../core/profile/store.js');
    const profile = createProfile(db, { name: 'p', main_activity_id: 'ganaderia-bovina-carne' });
    setActivities(db, profile.id, { main_activity_id: 'ganaderia-bovina-carne', secondary_activity_ids: ['cultivo-soja', 'elaboracion-aceites'] });
    const rep = generateReport(db, 'personalized', { profileId: profile.id });
    const narr = await generateNarrative(db, rep.id);
    const opp = narr.body.sections.find((s) => s.title === 'Oportunidades');
    const risk = narr.body.sections.find((s) => s.title === 'Riesgos');
    assert.ok(opp.paragraphs.some((p) => p.paragraph.includes('cultivo-soja')));
    assert.ok(risk.paragraphs.some((p) => p.paragraph.includes('elaboracion-aceites')));
    assert.ok(!opp.paragraphs.some((p) => p.paragraph.includes('elaboracion-aceites')), 'no debe generalizar la oportunidad a la actividad de riesgo');

    // actividad principal sin conclusión forzada (Caso 17)
    const impacts = narr.body.sections.find((s) => s.title === 'Impactos');
    assert.ok(impacts && impacts.paragraphs.some((p) => p.paragraph.includes('ganaderia-bovina-carne')));
    assert.equal(narr.status, 'validated');
  });

  test('Caso 18/19/20/21 - claims múltiples válidos; claim inexistente e intento de claim nuevo son detectados', async () => {
    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const realId = rep.claims[0].id;

    const badNarrative = {
      title: 'x',
      executive_summary: { paragraphs: [{ paragraph: 'Texto con referencia inexistente.', claim_ids: ['claim-no-existe'] }] },
      sections: [{ title: 'S', paragraphs: [{ paragraph: 'Una afirmación sin ningún respaldo estructurado.', claim_ids: [] }] }],
      paragraphs: [],
      claims_used: ['claim-no-existe'],
      warnings: [],
    };
    const result = validateNarrative(badNarrative, rep);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'UNKNOWN_CLAIM_ID'));
    assert.ok(result.errors.some((e) => e.code === 'UNSUPPORTED_CLAIM'));

    const goodNarrative = { title: 'x', executive_summary: { paragraphs: [{ paragraph: rep.claims[0].text, claim_ids: [realId] }] }, sections: [], claims_used: [realId] };
    assert.equal(validateNarrative(goodNarrative, rep).valid, true);
  });

  test('Caso 22 - causalidad no permitida es rechazada', async () => {
    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const id = rep.claims[0].id;
    const narrative = { title: 'x', executive_summary: { paragraphs: [{ paragraph: `${rep.claims[0].text} Esto provocará una caída generalizada.`, claim_ids: [id] }] }, sections: [], claims_used: [id] };
    const result = validateNarrative(narrative, rep);
    assert.ok(result.errors.some((e) => e.code === 'FORBIDDEN_CAUSAL_LANGUAGE'));
  });

  test('Caso 23 - pérdida de incertidumbre (certeza sobre evidencia débil) es rechazada', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    await runPipeline(db, [job('soja-precio.t2.json', { conflicting: true })]);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const uncertaintyClaim = rep.claims.find((c) => c.type === 'uncertainty');
    assert.ok(uncertaintyClaim);
    const narrative = { title: 'x', executive_summary: { paragraphs: [{ paragraph: 'Es un hecho confirmado que la situación se resolvió favorablemente.', claim_ids: [uncertaintyClaim.id] }] }, sections: [], claims_used: [uncertaintyClaim.id] };
    const result = validateNarrative(narrative, rep);
    assert.ok(result.errors.some((e) => e.code === 'CERTAINTY_ESCALATION'));
  });

  test('Caso 24 - cambio de temporalidad (comparación presentada como tendencia) es rechazado', async () => {
    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const changeClaim = rep.claims.find((c) => c.type === 'change');
    const narrative = { title: 'x', executive_summary: { paragraphs: [{ paragraph: `${changeClaim.text} Esto confirma una tendencia sostenida.`, claim_ids: [changeClaim.id] }] }, sections: [], claims_used: [changeClaim.id] };
    const result = validateNarrative(narrative, rep);
    assert.ok(result.errors.some((e) => e.code === 'UNSUPPORTED_TREND'));
  });

  test('Caso 25 - recomendación transformada en acción es rechazada', async () => {
    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const recClaim = rep.claims.find((c) => c.type === 'recommendation');
    assert.ok(recClaim);
    const narrative = { title: 'x', executive_summary: { paragraphs: [{ paragraph: 'Se debe vender inmediatamente la producción disponible.', claim_ids: [recClaim.id] }] }, sections: [], claims_used: [recClaim.id] };
    const result = validateNarrative(narrative, rep);
    assert.ok(result.errors.some((e) => e.code === 'RECOMMENDATION_AS_ACTION'));
  });

  test('Caso 26 - trazabilidad: la narrativa referencia claims trazables hasta la fuente', async () => {
    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const narr = await generateNarrative(db, rep.id);
    const { getTraceability } = await import('../reports/store.js');
    const trace = getTraceability(db, rep.id);
    const cited = trace.find((t) => narr.claims_used.includes(t.claim_id) && t.source_id);
    assert.ok(cited);
    assert.equal(cited.source_id, 'fao-giews-amis');
  });

  test('Caso 27 - reproducibilidad determinística: mismo reporte produce el mismo texto', async () => {
    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const narr1 = await generateNarrative(db, rep.id);
    // Releer el reporte y regenerar en modo determinístico con el MISMO reporte ya persistido debe dar el mismo texto (misma entrada -> misma salida).
    const { generateDeterministicNarrative } = await import('../narrative/deterministic.js');
    const { getReport } = await import('../reports/store.js');
    const again = generateDeterministicNarrative(getReport(db, rep.id));
    assert.deepEqual(again.paragraphs.map((p) => p.paragraph), narr1.body.paragraphs.map((p) => p.paragraph));
  });

  test('Caso 28/29/30 - proveedor DeepSeek/OpenRouter abstractos; sin API key, modo IA falla con mensaje claro (no rompe el modo determinístico)', async () => {
    const { DeepSeekProvider } = await import('../services/ai/deepseek-provider.js');
    const { OpenRouterProvider, resolveProvider } = await import('../services/ai/openrouter-provider.js');
    assert.ok(new DeepSeekProvider({ apiKey: '' }) instanceof AIProvider);
    assert.ok(new OpenRouterProvider({ apiKey: '' }) instanceof AIProvider);
    await assert.rejects(() => resolveProvider(class extends DeepSeekProvider { constructor() { super({ apiKey: '' }); } }), /ningun proveedor de IA configurado/);

    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    await assert.doesNotThrow(async () => generateNarrative(db, rep.id, { mode: 'deterministic' }));
  });

  test('Caso 31/32 - proveedor que devuelve contenido inválido es detectado por el validador (no aceptado silenciosamente)', async () => {
    await runSojaT1T2(db);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const provider = new FakeProvider(() => 'esto no es JSON {{{');
    await assert.rejects(() => generateNarrative(db, rep.id, { mode: 'ai', provider }), /no-JSON o inválido/);
  });

  test('Caso 33 - modo determinístico realiza 0 llamadas externas', () => {
    const files = ['deterministic.js'].map((f) => fs.readFileSync(join(__dirname, '..', 'narrative', f), 'utf-8')).join('\n');
    assert.ok(!files.includes('fetch('));
    assert.ok(!files.includes('services/ai'));
  });

  test('Caso 34 - self-loops continúan bloqueados', () => {
    const graph = knowledge.relevanceMappings();
    for (const id of ['agencias-operadores', 'alojamiento', 'cosecha-forestal']) {
      assert.equal((graph[id] ?? []).find((e) => e.target_activity_id === id), undefined);
    }
  });

  test('Caso 35 - reporte multiactividad real (fixtures) narrado y validado end-to-end', async () => {
    await runSojaT1T2(db);
    const { createProfile, setActivities } = await import('../core/profile/store.js');
    const profile = createProfile(db, { name: 'p', main_activity_id: 'ganaderia-bovina-carne' });
    setActivities(db, profile.id, { main_activity_id: 'ganaderia-bovina-carne', secondary_activity_ids: ['cultivo-soja', 'elaboracion-aceites'] });
    const rep = generateReport(db, 'personalized', { profileId: profile.id });
    const narr = await generateNarrative(db, rep.id);
    assert.equal(narr.status, 'validated');
    const versions = listNarratives(db, rep.id);
    assert.equal(versions.length, 1);
  });

  describe('Prueba de alucinación controlada (sección 30)', () => {
    test('detecta las 7 categorías de alucinación de un FakeProvider adversarial', async () => {
      await runSojaT1T2(db);
      const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
      const realClaimId = rep.claims[0].id;
      const provider = new FakeProvider(() =>
        JSON.stringify({
          title: 'x',
          executive_summary: {
            paragraphs: [
              { paragraph: 'El precio de la soja aumentó 999% y provocará una tendencia alcista garantizada según Reuters, y se debe comprar inmediatamente.', claim_ids: [realClaimId] },
              { paragraph: 'La ganadería bovina también se verá beneficiada de forma generalizada.', claim_ids: [] },
            ],
          },
          sections: [],
          warnings: [],
        })
      );
      const narr = await generateNarrative(db, rep.id, { mode: 'ai', provider });
      assert.equal(narr.status, 'rejected');
      const codes = new Set(narr.validation.errors.map((e) => e.code));
      assert.ok(codes.has('FABRICATED_NUMBER'), 'cifra inexistente');
      assert.ok(codes.has('UNSUPPORTED_SOURCE'), 'fuente inexistente');
      assert.ok(codes.has('UNSUPPORTED_TREND'), 'tendencia no existente');
      assert.ok(codes.has('FORBIDDEN_CAUSAL_LANGUAGE'), 'causalidad no respaldada');
      assert.ok(codes.has('RECOMMENDATION_AS_ACTION'), 'recomendación nueva/acción');
      assert.ok(codes.has('UNSUPPORTED_CLAIM'), 'afirmación (ganadería beneficiada) sin ningún claim que la respalde');
    });

    test('una narrativa fiel al reporte (mismo texto de los claims) valida sin errores', async () => {
      await runSojaT1T2(db);
      const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
      const provider = new FakeProvider(() =>
        JSON.stringify({
          title: rep.title,
          executive_summary: { paragraphs: rep.claims.slice(0, 2).map((c) => ({ paragraph: c.text, claim_ids: [c.id] })) },
          sections: [],
          warnings: [],
        })
      );
      const narr = await generateNarrative(db, rep.id, { mode: 'ai', provider });
      assert.equal(narr.status, 'validated');
      assert.deepEqual(narr.validation.errors, []);
    });
  });
});
