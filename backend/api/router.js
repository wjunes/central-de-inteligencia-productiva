// Router minimo, sin framework (prompt seccion 43: evitar dependencias
// innecesarias). Solo los endpoints necesarios para probar el motor
// (prompt seccion 33) - no una API extensa.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '../pipeline/orchestrator.js';
import {
  createProfile, updateProfile, deleteProfile, listProfiles, getProfile,
  setActivities, setMarkets, setProducts, setInputs, setPriorities, setConstraints,
  ValidationError,
} from '../core/profile/store.js';
import { getChanges, getPersonalizedRelevance } from '../core/profile/personalize.js';
import { getProfileCatalogs } from '../core/profile/catalogs.js';
import { getActivityRamifications, ActivityNotFoundError } from '../core/profile/ramifications.js';
import { buildRadarView } from '../radar/build.js';
import { generateReport } from '../reports/build.js';
import { getReport, listReports, getVersions, getTraceability } from '../reports/store.js';
import { generateNarrative } from '../narrative/build.js';
import { getLatestNarrative } from '../narrative/store.js';
import { validateNarrative } from '../narrative/validator.js';
import { resolveProvider } from '../services/ai/openrouter-provider.js';
import { DeepSeekProvider } from '../services/ai/deepseek-provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

function rows(db, table, limit = 50) {
  return db.prepare(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT ?`).all(limit);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    return {};
  }
}

export function createRouter(db) {
  return async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    try {
      if (req.method === 'GET' && pathname === '/health') {
        return json(res, 200, { status: 'ok', time: new Date().toISOString() });
      }

      if (req.method === 'GET' && pathname === '/pipeline/status') {
        const last = db.prepare('SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 1').get();
        return json(res, 200, { last_run: last ?? null });
      }

      if (req.method === 'GET' && pathname === '/pipeline/runs') {
        return json(res, 200, { runs: rows(db, 'pipeline_runs') });
      }

      if (req.method === 'POST' && pathname === '/pipeline/run') {
        const body = await readBody(req);
        const jobs = (body.jobs ?? []).map((j) => ({
          ...j,
          fixturePath: j.fixtureFile ? join(FIXTURES_DIR, j.fixtureFile) : j.fixturePath,
        }));
        if (!jobs.length) return json(res, 400, { error: 'body.jobs debe ser un array no vacío (ver README para el formato)' });
        const result = await runPipeline(db, jobs, { mode: body.mode ?? 'fixture' });
        return json(res, 200, { run_id: result.runId, stats: result.stats, hadErrors: result.hadErrors });
      }

      if (req.method === 'GET' && pathname === '/signals') return json(res, 200, { signals: rows(db, 'signals') });
      if (req.method === 'GET' && pathname === '/intelligence') return json(res, 200, { intelligence: rows(db, 'intelligence') });
      if (req.method === 'GET' && pathname === '/decisions') return json(res, 200, { decisions: rows(db, 'decisions') });
      if (req.method === 'GET' && pathname === '/recommendations') return json(res, 200, { recommendations: rows(db, 'recommendations') });

      // GET /profile/catalogs (singular, deliberado): catálogos de solo
      // lectura para construir la edición del Perfil Productivo sin duplicar
      // conocimiento en el frontend (GAP crítico documentado en
      // docs/producto/arquitectura-funcional-ux.md). Se usa '/profile' en
      // singular -y no '/profiles/catalogs'- para no colisionar con la
      // resolución de ':id' de la ruta plural de abajo.
      if (req.method === 'GET' && pathname === '/profile/catalogs') {
        return json(res, 200, getProfileCatalogs());
      }

      // GET /profile/ramifications/:activityId (GAP "Paso 2A"): ramificaciones
      // efectivas de una actividad (productos/insumos/... reales), unica
      // fuente = knowledge.effectiveRamifications() via core/profile/ramifications.js.
      const ramificationsMatch = pathname.match(/^\/profile\/ramifications\/([^/]+)$/);
      if (req.method === 'GET' && ramificationsMatch) {
        try {
          return json(res, 200, getActivityRamifications(decodeURIComponent(ramificationsMatch[1])));
        } catch (err) {
          if (err instanceof ActivityNotFoundError) return json(res, 404, { error: 'activity_not_found', message: err.message });
          throw err;
        }
      }

      // --- /profiles (perfil productivo y personalización) ---
      const seg = pathname.split('/').filter(Boolean); // ['profiles', ':id', 'sub']

      if (seg[0] === 'profiles') {
        if (seg.length === 1 && req.method === 'GET') return json(res, 200, { profiles: listProfiles(db) });
        if (seg.length === 1 && req.method === 'POST') {
          const body = await readBody(req);
          return json(res, 201, createProfile(db, body));
        }

        if (seg.length === 2) {
          const id = seg[1];
          if (req.method === 'GET') {
            const p = getProfile(db, id);
            return p ? json(res, 200, p) : json(res, 404, { error: 'profile_not_found' });
          }
          if (req.method === 'PUT') {
            const body = await readBody(req);
            const p = updateProfile(db, id, body);
            return p ? json(res, 200, p) : json(res, 404, { error: 'profile_not_found' });
          }
          if (req.method === 'DELETE') {
            const deleted = deleteProfile(db, id);
            return json(res, deleted ? 200 : 404, deleted ? { deleted: true } : { error: 'profile_not_found' });
          }
        }

        if (seg.length === 3) {
          const id = seg[1];
          const sub = seg[2];
          if (!getProfile(db, id)) return json(res, 404, { error: 'profile_not_found' });

          if (sub === 'activities' && req.method === 'GET') return json(res, 200, { activities: getProfile(db, id).activities });
          if (sub === 'activities' && req.method === 'PUT') {
            const body = await readBody(req);
            return json(res, 200, setActivities(db, id, body));
          }
          if (sub === 'markets' && req.method === 'PUT') {
            const body = await readBody(req);
            return json(res, 200, setMarkets(db, id, body.market_ids ?? []));
          }
          if (sub === 'products' && req.method === 'PUT') {
            const body = await readBody(req);
            return json(res, 200, setProducts(db, id, body.products ?? []));
          }
          if (sub === 'inputs' && req.method === 'PUT') {
            const body = await readBody(req);
            return json(res, 200, setInputs(db, id, body.inputs ?? []));
          }
          if (sub === 'priorities' && req.method === 'PUT') {
            const body = await readBody(req);
            return json(res, 200, setPriorities(db, id, body.priorities ?? []));
          }
          if (sub === 'constraints' && req.method === 'PUT') {
            const body = await readBody(req);
            return json(res, 200, setConstraints(db, id, body.constraints ?? []));
          }
          if (sub === 'relevance' && req.method === 'GET') return json(res, 200, getPersonalizedRelevance(db, id));
          if (sub === 'changes' && req.method === 'GET') return json(res, 200, getChanges(db, id));
          if (sub === 'radar' && req.method === 'GET') {
            const view = url.searchParams.get('view');
            return json(res, 200, buildRadarView(db, id, view));
          }
          if (sub === 'intelligence' && req.method === 'GET') {
            const changes = getChanges(db, id);
            return json(res, 200, { profile_id: id, intelligence: changes.changes.flatMap((c) => c.intelligence) });
          }
          if (sub === 'recommendations' && req.method === 'GET') {
            const changes = getChanges(db, id);
            const recs = changes.changes.flatMap((c) => c.intelligence.flatMap((i) => i.decisions.map((d) => d.recommendation).filter(Boolean)));
            return json(res, 200, { profile_id: id, recommendations: recs });
          }
        }
      }

      // --- /reports (Motor de Reportes) ---
      if (seg[0] === 'reports') {
        if (seg.length === 1 && req.method === 'GET') {
          return json(res, 200, { reports: listReports(db, { type: url.searchParams.get('type'), profileId: url.searchParams.get('profile_id') }) });
        }
        if (seg.length === 2 && seg[1] === 'generate' && req.method === 'POST') {
          const body = await readBody(req);
          const { type, ...params } = body;
          if (!type) return json(res, 400, { error: 'validation_error', message: 'body.type es obligatorio' });
          const report = generateReport(db, type, params);
          return json(res, 201, report);
        }
        if (seg.length === 2 && req.method === 'GET') {
          const report = getReport(db, seg[1]);
          return report ? json(res, 200, report) : json(res, 404, { error: 'report_not_found' });
        }
        if (seg.length === 3 && seg[2] === 'traceability' && req.method === 'GET') {
          if (!getReport(db, seg[1])) return json(res, 404, { error: 'report_not_found' });
          return json(res, 200, { report_id: seg[1], traceability: getTraceability(db, seg[1]) });
        }
        if (seg.length === 3 && seg[2] === 'versions' && req.method === 'GET') {
          if (!getReport(db, seg[1])) return json(res, 404, { error: 'report_not_found' });
          return json(res, 200, { report_id: seg[1], versions: getVersions(db, seg[1]) });
        }
        if (seg.length === 3 && seg[2] === 'narrative' && req.method === 'GET') {
          if (!getReport(db, seg[1])) return json(res, 404, { error: 'report_not_found' });
          const narrative = getLatestNarrative(db, seg[1]);
          return narrative ? json(res, 200, narrative) : json(res, 404, { error: 'narrative_not_found' });
        }
        if (seg.length === 3 && seg[2] === 'narrative' && req.method === 'POST') {
          if (!getReport(db, seg[1])) return json(res, 404, { error: 'report_not_found' });
          const body = await readBody(req);
          const mode = body.mode ?? 'deterministic';
          let provider = null;
          if (mode === 'ai') {
            try {
              provider = await resolveProvider(DeepSeekProvider);
            } catch (err) {
              return json(res, 503, { error: 'ai_unavailable', message: err.message, hint: "usar mode='deterministic' (no requiere IA)" });
            }
          }
          const narrative = await generateNarrative(db, seg[1], { mode, provider });
          return json(res, 201, narrative);
        }
        if (seg.length === 4 && seg[2] === 'narrative' && seg[3] === 'validate' && req.method === 'POST') {
          const report = getReport(db, seg[1]);
          if (!report) return json(res, 404, { error: 'report_not_found' });
          const body = await readBody(req);
          const narrativeToCheck = body.narrative ?? getLatestNarrative(db, seg[1])?.body;
          if (!narrativeToCheck) return json(res, 404, { error: 'narrative_not_found', message: 'no hay narrativa para validar y no se envió una en el body' });
          return json(res, 200, { report_id: seg[1], validation: validateNarrative(narrativeToCheck, report) });
        }
      }

      return json(res, 404, { error: 'not_found', path: pathname });
    } catch (err) {
      if (err instanceof ValidationError) return json(res, 400, { error: 'validation_error', message: err.message });
      return json(res, 500, { error: 'internal_error', message: err.message });
    }
  };
}
