-- Esquema operativo (estado, historico, ejecuciones, resultados, referencias).
-- NO duplica el conocimiento estatico de knowledge/: cada fila referencia ids
-- de knowledge/ (source_id, monitor_id, activity_id, topic_id, ramification_id)
-- en vez de copiar su contenido.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id                        TEXT PRIMARY KEY,
  mode                      TEXT NOT NULL,              -- 'fixture' | 'live'
  started_at                TEXT NOT NULL,
  finished_at               TEXT,
  status                    TEXT NOT NULL DEFAULT 'running', -- running | completed | completed_with_errors | failed
  records_processed         INTEGER NOT NULL DEFAULT 0,
  changes_detected          INTEGER NOT NULL DEFAULT 0,
  signals_generated         INTEGER NOT NULL DEFAULT 0,
  intelligence_generated    INTEGER NOT NULL DEFAULT 0,
  decisions_generated       INTEGER NOT NULL DEFAULT 0,
  recommendations_generated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS captures (
  id               TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL REFERENCES pipeline_runs(id),
  source_id        TEXT NOT NULL,
  monitor_id       TEXT NOT NULL,
  resource_id      TEXT,
  captured_at      TEXT NOT NULL,
  parameters       TEXT,                 -- JSON
  status           TEXT NOT NULL,        -- ok | fixture | source_unavailable | acquisition_error
  response_hash    TEXT,
  version          TEXT,
  size_bytes       INTEGER,
  latency_ms       INTEGER,
  error            TEXT,
  normalized_data  TEXT                  -- JSON, salida de normalize() - nunca el payload crudo completo
);

CREATE TABLE IF NOT EXISTS changes (
  id                   TEXT PRIMARY KEY,
  run_id               TEXT NOT NULL REFERENCES pipeline_runs(id),
  capture_id           TEXT NOT NULL REFERENCES captures(id),
  previous_capture_id  TEXT REFERENCES captures(id),
  monitor_id           TEXT NOT NULL,
  change_class         TEXT NOT NULL,   -- vocabulario de knowledge/monitoring/change-detection.json (8 valores)
  detected_at          TEXT NOT NULL,
  field                TEXT,
  previous_value       TEXT,
  new_value            TEXT,
  detail               TEXT              -- JSON
);

CREATE TABLE IF NOT EXISTS signals (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES pipeline_runs(id),
  change_id       TEXT NOT NULL REFERENCES changes(id),
  signal_type     TEXT NOT NULL,   -- knowledge/signals/signal-types.json
  topic_id        TEXT,            -- knowledge/ramifications/_signal_types.json
  direction       TEXT,
  origin_activity_id TEXT,
  origin_ramification_id TEXT,
  source_id       TEXT,
  monitor_id      TEXT,
  detected_at     TEXT NOT NULL,
  dedup_key       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'detected'  -- signals/signal-types.json dimensions.status
);

CREATE TABLE IF NOT EXISTS relevance_results (
  id                 TEXT PRIMARY KEY,
  run_id             TEXT NOT NULL REFERENCES pipeline_runs(id),
  signal_id          TEXT NOT NULL REFERENCES signals(id),
  activity_id        TEXT NOT NULL,
  relevance_level    TEXT NOT NULL,   -- knowledge/relevance/levels.json
  factor             TEXT NOT NULL,   -- direct_dependency | value_chain_relation | domain_coexposure
  reason             TEXT,
  evidence           TEXT,            -- JSON
  is_primary_activity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS intelligence (
  id                    TEXT PRIMARY KEY,
  run_id                TEXT NOT NULL REFERENCES pipeline_runs(id),
  based_on_signal_ids   TEXT NOT NULL,  -- JSON array
  activity_id           TEXT NOT NULL,
  type                  TEXT NOT NULL,  -- trend | impact | risk | opportunity
  topic_id              TEXT,
  impact_direction      TEXT NOT NULL,  -- positive | negative | mixed | neutral | uncertain
  evidence_level        TEXT NOT NULL,
  confidence            TEXT,           -- JSON: {source_quality, change_detection_confidence, relevance_confidence, analysis_confidence}
  horizon               TEXT,
  scope                 TEXT,
  status                TEXT NOT NULL DEFAULT 'detected',
  rationale             TEXT NOT NULL,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id                        TEXT PRIMARY KEY,
  run_id                    TEXT NOT NULL REFERENCES pipeline_runs(id),
  triggered_by_intelligence_id TEXT NOT NULL REFERENCES intelligence(id),
  type                      TEXT NOT NULL,  -- decision-types.json
  scope                     TEXT,
  activity_id               TEXT NOT NULL,
  alternatives              TEXT NOT NULL,  -- JSON array (esquema de decision/alternatives.json)
  status                    TEXT NOT NULL DEFAULT 'open',
  created_at                TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendations (
  id                   TEXT PRIMARY KEY,
  run_id               TEXT NOT NULL REFERENCES pipeline_runs(id),
  decision_id          TEXT NOT NULL REFERENCES decisions(id),
  type                 TEXT NOT NULL,   -- recommendation-types.json
  strength             TEXT NOT NULL,   -- recommendations/criteria.json
  evidence_level       TEXT,            -- recommendations/evidence.json (strong|moderate|limited|insufficient|conflicting)
                                          -- agregado en la etapa Radar: ya se calculaba en memoria pero no se persistia,
                                          -- y el Radar necesita distinguir 'conflicting' de 'insufficient' (ambos
                                          -- producian strength=none de forma indistinguible - ver radar/README).
  statement            TEXT NOT NULL,
  rationale            TEXT NOT NULL,
  conditions           TEXT,            -- JSON
  priority             TEXT NOT NULL,
  activity_id          TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'active',
  valid_from           TEXT NOT NULL,
  valid_until          TEXT,
  previous_version_id  TEXT REFERENCES recommendations(id),
  created_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS errors (
  id           TEXT PRIMARY KEY,
  run_id       TEXT REFERENCES pipeline_runs(id),
  stage        TEXT NOT NULL,
  error_type   TEXT NOT NULL,   -- technical_error | source_error | validation_error | knowledge_error | logic_error | ai_error
  message      TEXT NOT NULL,
  detail       TEXT,            -- JSON, nunca credenciales
  occurred_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Perfil productivo y personalizacion. Solo REFERENCIAS (activity_id,
-- ramification_id, topic_id, market_id son ids de knowledge/, nunca copias
-- de su contenido). No hay señales/inteligencia/capturas por perfil: estas
-- tablas se JOINean contra las ya generadas centralmente.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  role              TEXT,             -- productor | empresario | industrial | comerciante | exportador | tecnico | profesional | proveedor | inversor
  main_activity_id  TEXT,             -- referencia a activities/ - centro de gravedad, NO garantiza relevancia maxima
  location          TEXT,             -- contexto de presentacion (ver gaps: no afecta el calculo de relevancia todavia)
  scale             TEXT,
  horizon           TEXT,             -- short | medium | long
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_activities (
  id           TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_id  TEXT NOT NULL,      -- referencia a activities/activities.json
  kind         TEXT NOT NULL,      -- main | secondary
  UNIQUE(profile_id, activity_id)
);

CREATE TABLE IF NOT EXISTS profile_markets (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  market_id   TEXT NOT NULL,       -- referencia a domain-names/mercados.json#mercados-destino.market_dimensions
  UNIQUE(profile_id, market_id)
);

CREATE TABLE IF NOT EXISTS profile_products (
  id               TEXT PRIMARY KEY,
  profile_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_id      TEXT NOT NULL,  -- espacio de nombres de la ramificacion (no todos los ids son globalmente unicos)
  ramification_id  TEXT NOT NULL,  -- referencia a un nodo category=products de ramifications/<activity_id>.json
  UNIQUE(profile_id, activity_id, ramification_id)
);

CREATE TABLE IF NOT EXISTS profile_inputs (
  id               TEXT PRIMARY KEY,
  profile_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_id      TEXT NOT NULL,
  ramification_id  TEXT NOT NULL,  -- referencia a un nodo category=inputs/cost_factors/suppliers de ramifications/<activity_id>.json
  UNIQUE(profile_id, activity_id, ramification_id)
);

CREATE TABLE IF NOT EXISTS profile_priorities (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id    TEXT NOT NULL,       -- referencia a ramifications/_signal_types.json
  rank        INTEGER NOT NULL,    -- 1 = maxima prioridad declarada por el usuario (orden de presentacion, nunca evidencia)
  UNIQUE(profile_id, topic_id)
);

CREATE TABLE IF NOT EXISTS profile_constraints (
  id           TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,      -- decision/constraints.json categories
  severity     TEXT NOT NULL,      -- hard_constraint | soft_constraint | unknown_constraint
  description  TEXT
);

CREATE INDEX IF NOT EXISTS idx_profile_activities_activity ON profile_activities(activity_id);
CREATE INDEX IF NOT EXISTS idx_profile_activities_profile ON profile_activities(profile_id);

-- ---------------------------------------------------------------------------
-- Radar Productivo. Una 'situacion' agrupa >=2 intelligence units relacionados
-- (mismo topic_id + actividades ya conectadas por relevance/). Solo referencias
-- (intelligence_ids), nunca copia contenido. Persistida porque su ESTADO
-- (emerging/active/persistent/weakening/resolved) depende de observarla a
-- lo largo de varias corridas del pipeline, no de una sola consulta.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS radar_situations (
  id                 TEXT PRIMARY KEY,
  dedup_key          TEXT NOT NULL UNIQUE,  -- topic_id + actividades ordenadas: identidad estable entre corridas
  topic_id           TEXT,
  activity_ids       TEXT NOT NULL,          -- JSON array
  intelligence_ids   TEXT NOT NULL,           -- JSON array de referencias (nunca copias)
  status             TEXT NOT NULL,            -- emerging|active|persistent|weakening|resolved
  conflicting        INTEGER NOT NULL DEFAULT 0,
  first_seen_at      TEXT NOT NULL,
  last_seen_at       TEXT NOT NULL,
  observation_count  INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_radar_situations_topic ON radar_situations(topic_id);

CREATE INDEX IF NOT EXISTS idx_changes_monitor ON changes(monitor_id, detected_at);
CREATE INDEX IF NOT EXISTS idx_signals_dedup ON signals(dedup_key);
CREATE INDEX IF NOT EXISTS idx_relevance_activity ON relevance_results(activity_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_activity ON intelligence(activity_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_activity ON recommendations(activity_id, status);

-- ---------------------------------------------------------------------------
-- Motor de Reportes. Presenta inteligencia ya validada - no la genera.
-- Solo 4 tablas (de las 6 sugeridas): 'report_sections' se omite (una
-- sección es una agrupación de report_claims por campo 'section' + el JSON
-- ya ensamblado en reports.body - una tabla aparte duplicaria lo mismo dos
-- veces); 'report_versions' se omite (reports.previous_version_id +
-- status ya encadenan el historial, mismo patrón que recommendations).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS report_snapshots (
  id                    TEXT PRIMARY KEY,
  created_at            TEXT NOT NULL,
  cutoff_at             TEXT NOT NULL,
  situation_ids         TEXT NOT NULL,  -- JSON array (radar_situations.id)
  intelligence_ids      TEXT NOT NULL,  -- JSON array
  decision_ids          TEXT NOT NULL,  -- JSON array
  recommendation_ids    TEXT NOT NULL,  -- JSON array
  signal_ids            TEXT NOT NULL   -- JSON array
);

CREATE TABLE IF NOT EXISTS reports (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL,   -- executive|sectorial|market|risk|opportunity|personalized|periodic
  title                TEXT NOT NULL,
  scope                TEXT NOT NULL,   -- JSON: {activity_id?, market_id?, profile_id?, period?, ...} - declarado, nunca inferido del título
  profile_id           TEXT REFERENCES profiles(id),
  created_at           TEXT NOT NULL,
  cutoff_at            TEXT NOT NULL,
  period_start         TEXT,
  period_end           TEXT,
  rules_version        TEXT NOT NULL,   -- version declarada de las reglas de seleccion/plantillas (reports/build.js)
  snapshot_id          TEXT NOT NULL REFERENCES report_snapshots(id),
  status               TEXT NOT NULL DEFAULT 'generated',  -- draft|generated|published|superseded|archived
  version              INTEGER NOT NULL DEFAULT 1,
  previous_version_id  TEXT REFERENCES reports(id),
  supersede_reason     TEXT,
  body                 TEXT NOT NULL    -- JSON ya ensamblado (metadata+scope+secciones) - derivado de report_claims, cacheado para lectura
);

CREATE TABLE IF NOT EXISTS report_claims (
  id              TEXT PRIMARY KEY,
  report_id       TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  section         TEXT NOT NULL,   -- current_situation|changes|trends|impacts|risks|opportunities|decisions|recommendations|uncertainty|comparisons
  type            TEXT NOT NULL,   -- fact|change|trend|impact|risk|opportunity|decision|recommendation|uncertainty|comparison
  activity_id     TEXT,
  text            TEXT NOT NULL,   -- plantilla determinística, nunca texto libre/IA
  importance      TEXT NOT NULL,   -- critical|high|medium|low|none (reusa relevance/levels.json)
  evidence_level  TEXT,
  confidence      TEXT,            -- JSON
  references_json TEXT NOT NULL    -- JSON: {intelligence_id?, decision_id?, recommendation_id?, signal_id?, situation_id?}
);

CREATE TABLE IF NOT EXISTS report_sources (
  id          TEXT PRIMARY KEY,
  report_id   TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  source_id   TEXT NOT NULL,
  UNIQUE(report_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_type_profile ON reports(type, profile_id);
CREATE INDEX IF NOT EXISTS idx_report_claims_report ON report_claims(report_id, section);
CREATE INDEX IF NOT EXISTS idx_report_sources_report ON report_sources(report_id);
