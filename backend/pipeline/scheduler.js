// Scheduler (Bloque A, extendido en Bloque B con contexto de monitor):
// dispara pipeline/orchestrator.js#runPipeline()
// periódicamente sobre los monitores REALMENTE operables (adaptadores
// ckan_api/api_rest_json - ver data/acquisition/adapters.js). No reimplementa
// ninguna regla del motor: la frecuencia por monitor y el filtro de
// "¿corresponde readquirir?" siguen resueltos íntegramente por
// data/acquisition/capture.js#isDue() (invocado dentro de runPipeline, vía
// acquire()), y la deduplicación de señales sigue resuelta por
// intelligence/signals/signals.js#dedup_key. Este módulo NO vuelve a calcular
// ninguna de las dos cosas - solo decide CUÁNDO invocar al orquestador con la
// lista de monitores candidatos, y protege contra ejecuciones superpuestas.
//
// Responsabilidad, literal:
//   determinar cuándo ejecutar -> disparar pipeline -> registrar estado
//   -> finalizar -> esperar próxima ejecución.
import { knowledge } from '../knowledge/loader.js';
import { runPipeline as defaultRunPipeline } from './orchestrator.js';

// Únicos 2 métodos con adaptador real hoy (data/acquisition/adapters.js) -
// api_soap/feed/file_download/manual_capture son stubs que solo devolverían
// acquisition_error; incluirlos aquí generaría "ejecuciones" que nunca
// adquieren nada real, sin aportar valor y ensuciando pipeline_runs/errors.
const LIVE_METHODS = ['ckan_api', 'api_rest_json'];

export function operableMonitors() {
  return knowledge.monitors().filter((m) => m.enabled && LIVE_METHODS.includes(m.method));
}

// kind debe coincidir con la forma real que cada adaptador normaliza
// (data/acquisition/adapters.js: ckanApi -> {kind:'dataset_list',...},
// apiRestJson -> {kind:'raw_json',...}) - data/validation/validate.js solo
// aplica sus reglas cuando `kind` coincide con lo que YA declaró el
// adaptador; dejarlo sin especificar hace que orchestrator.js lo asuma
// 'indicator' por defecto (ver runPipeline()) y rechace por validación
// cualquier captura que no tenga forma de indicador numérico - verificado
// en la validación real de esta etapa (Fase VALIDACIÓN REAL). Esto NO es
// una regla nueva de negocio: es hacer coincidir 2 vocabularios que el
// motor central ya define, para los monitores que la automatización dispara.
const VALIDATION_KIND_BY_METHOD = { ckan_api: 'dataset_list', api_rest_json: 'raw_json' };

// Bloque B: propaga m.context (knowledge/monitoring/monitors.json) hacia el
// context del job, EXACTAMENTE con el mismo shape que ya consume
// orchestrator.js/signals.js (originActivityId/originRamificationId/topicId -
// ver comentario en signals.js). No es una segunda lógica de contexto: es un
// mapeo 1:1 de nombres (snake_case del conocimiento -> camelCase del motor),
// sin inferencia. m.context es opcional y hoy solo existe para los monitores
// donde hay una asociación determinística documentada (ver monitors.json) -
// para el resto, buildLiveJobs se comporta exactamente igual que en Bloque A
// (solo 'kind'), dejando la señal sin origen de actividad (uncontextualized:
// calculateRelevance ya devuelve [] sin origin_activity_id, sin necesidad de
// marcar nada aparte - ver core/relevance/relevance-engine.js).
function contextFromMonitor(m) {
  const c = m.context;
  if (!c) return {};
  return {
    ...(c.origin_activity_id ? { originActivityId: c.origin_activity_id } : {}),
    ...(c.origin_ramification_id ? { originRamificationId: c.origin_ramification_id } : {}),
    ...(c.topic_id ? { topicId: c.topic_id } : {}),
  };
}

export function buildLiveJobs(monitors) {
  // Sin fixturePath (dispara la rama real de acquire()/adapters.js).
  return monitors.map((m) => ({
    monitorId: m.id,
    context: { kind: VALIDATION_KIND_BY_METHOD[m.method], ...contextFromMonitor(m) },
  }));
}

// createScheduler(): runPipelineFn/listOperableMonitors son inyectables
// exclusivamente para pruebas deterministas (mismo patrón ya usado en
// services/api.js con fetchImpl/baseUrl) - en producción siempre son las
// funciones reales de arriba.
export function createScheduler(
  db,
  { intervalMs = 15 * 60 * 1000, onTick = null, runPipelineFn = defaultRunPipeline, listOperableMonitors = operableMonitors } = {}
) {
  let timer = null;
  let enabled = false;
  let running = false;
  let skippedOverlapCount = 0;
  let lastTickAt = null;
  let lastResult = null;
  let lastError = null;

  async function tick() {
    lastTickAt = new Date().toISOString();

    if (running) {
      skippedOverlapCount += 1;
      onTick?.({ skipped: true, reason: 'previous_run_still_active' });
      return;
    }

    const monitors = listOperableMonitors();
    if (!monitors.length) {
      onTick?.({ skipped: true, reason: 'no_operable_monitors' });
      return;
    }

    running = true;
    try {
      lastResult = await runPipelineFn(db, buildLiveJobs(monitors), { mode: 'live' });
      lastError = null;
      onTick?.({ skipped: false, result: lastResult });
    } catch (err) {
      // runPipeline() ya aísla el error de CADA job (try/catch por job,
      // ver orchestrator.js) y siempre corre finishRun() al terminar el
      // bucle - llegar acá es un fallo no anticipado (p. ej. lanzado antes
      // de que el bucle empiece). pipeline_runs.status='failed' está
      // definido en el esquema pero ningún camino normal lo alcanza hoy;
      // esta es la única vía real para que un run quede marcado 'failed'
      // en vez de 'running' para siempre.
      lastError = err.message;
      db.prepare("UPDATE pipeline_runs SET status = 'failed', finished_at = ? WHERE status = 'running'").run(new Date().toISOString());
      onTick?.({ skipped: false, error: err });
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (enabled) return; // ya iniciado - nunca una segunda instancia en el mismo proceso
      enabled = true;
      timer = setInterval(tick, intervalMs);
      // unref(): un timer de scheduler nunca debe ser la razón por la que el
      // proceso no puede cerrar (Fase ARRANQUE/APAGADO) - node:sqlite/http ya
      // mantienen vivo el proceso mientras corresponde.
      if (typeof timer.unref === 'function') timer.unref();
    },
    stop() {
      enabled = false;
      if (timer) clearInterval(timer);
      timer = null;
    },
    // Expuesto para pruebas deterministas (Fase TESTS) y para forzar un tick
    // sin esperar el intervalo real - no es un endpoint nuevo, es interno.
    triggerNow: tick,
    getStatus() {
      return {
        enabled,
        state: running ? 'running' : 'idle',
        interval_ms: intervalMs,
        last_tick_at: lastTickAt,
        skipped_overlap_count: skippedOverlapCount,
        operable_monitor_count: listOperableMonitors().length,
        last_error: lastError,
        last_run_id: lastResult?.runId ?? null,
      };
    },
  };
}
