# contrato-decisiones-recomendaciones

> Verificación contractual dirigida (Paso 2F-0) — no es una auditoría general. Su único objetivo es determinar si el estado real de Decisiones y Recomendaciones alcanza para diseñar su UX/UI en 2F-1 sin inventar comportamiento. Todo lo afirmado fue verificado por lectura directa de `backend/decision/decision.js` y `backend/intelligence/recommendations/recommendations.js` (sin cambios desde el commit `3de4c9d`, anterior a la auditoría de Radar) y por ejecución real mínima cuando el código por sí solo no bastaba para confirmar una relación. Reutiliza sin repetir lo ya congelado en `contrato-radar.md` (§14, §15, §17.6-17.8) y `contrato-informes.md` (§11, §12, §15): aquí solo se agrega lo que esos contratos no cubrieron en detalle — la verificación en vivo de la relación decisión→recomendación y su alcance real en la UI.

---

## 1. Alcance

Decisiones y Recomendaciones **no son pantallas nuevas de datos**: son las mismas entidades ya expuestas hoy dentro de `intelligence[].decisions[]` en `GET /profiles/:id/radar` / `/changes` (consumidas parcialmente por Situación, vía `radar.monitor`/`recommendation.statement`). 2F-1 es una **exposición más profunda** de datos que el backend ya calcula — no requiere nuevo cálculo, nuevo endpoint, ni nueva capa.

## 2. Modelo real de Decisión

Generada siempre y únicamente por `evaluateDecision()` (`backend/decision/decision.js`), una por cada unidad de inteligencia (`shouldTriggerDecision()` devuelve `true` incondicionalmente — no hay un segundo filtro de importancia).

```
{
  id, run_id, triggered_by_intelligence_id,
  type: 'risk_response' | 'opportunity_pursuit' | 'production' | 'commercial',
  scope, activity_id, status: 'open',
  alternatives: [ {...}, {...} ]
}
```

- `type` se deriva de `intelligence.type`: `risk`→`risk_response`, `opportunity`→`opportunity_pursuit`, `impact`→`production` (si `impact_direction==='negative'`) o `commercial` (en cualquier otro caso).
- **Siempre exactamente 2 alternativas**: una `no_action` (`id:'monitorear'`, `kind:'no_action'`, SIEMPRE presente) y una acción específica (`preparar_respuesta` / `evaluar_aprovechamiento` / `ajustar_operacion`, según `intelligence.type`).
- **Nunca hay `best_option`** — no existe metodología de scoring (`knowledge/decision/criteria.json.no_scoring`), confirmado: ningún campo del objeto lo indica.
- Cada alternativa trae: `kind`, `description`, `is_contingent`, `trigger_condition?`, `factors_for[]`, `factors_against[]`, `constraints[]`, `uncertainty:{status}`, `reversibility`, `relative_cost:'unknown'`, `status`.
- **`constraints[]` de cada alternativa NO proviene del perfil**: son categorías fijas hardcodeadas por `intel.type` (p. ej. `{category:'data_availability', severity:'soft_constraint'}` para riesgo, `{category:'resource', severity:'unknown_constraint'}` para oportunidad) — nunca leen `profile.constraints`. Es una manifestación adicional del GAP 12.2 (constraints sin influencia), esta vez dentro del propio modelo de decisión, no solo en relevancia.
- No existe un campo `information_value` explícito (GAP 17.6, heredado).
- **`status` de la decisión es siempre `'open'`** — no hay ciclo de vida propio de la decisión (a diferencia de la recomendación, que sí versiona). No existe `'closed'`/`'resolved'` en ningún camino de código.

## 3. Modelo real de Recomendación

Generada siempre por `generateRecommendation()` (`backend/intelligence/recommendations/recommendations.js`), llamada incondicionalmente después de cada decisión creada (`pipeline/orchestrator.js:111`, sin condición previa).

```
{
  id, run_id, decision_id, type, strength, evidence_level, statement, rationale,
  priority, activity_id, status: 'active' | 'superseded',
  valid_from, valid_until, previous_version_id, created_at
}
```

- **Tipos realmente alcanzables** (`typeFor()`): `monitor`, `seek_information`, `prepare`, `pursue_opportunity`, `mitigate`, `adjust`, `evaluate` (7 de los 8 catalogados en `knowledge/recommendations/recommendation-types.json`). **`defer` está catalogado pero ningún camino de código lo produce** (GAP 17.8, heredado). `prioritize`/`review` están deliberadamente fuera del catálogo de tipos (modelados como `priority` y como evento de ciclo de vida, no como `type`).
- `statement` **siempre sale de una plantilla regulada** (`LANGUAGE_BY_STRENGTH`, 5 plantillas fijas) — nunca texto libre. Los verbos son deliberadamente no imperativos.
- `evidence_level` (`insufficient | limited | moderate | conflicting`, y `strong` catalogado pero no alcanzado por el motor actual) es **distinto** de `intelligence.evidence_level` (que siempre vale `'structural_relationship'`, dead branching ya documentado en `contrato-radar.md` §11) — dos campos del mismo nombre, capas distintas.
- `conflicting` **es un flag externo del contexto del job del pipeline** (`context.conflicting`), no una detección automática de contradicción entre fuentes reales — confirmado por grep: ningún módulo del pipeline calcula `conflicting` a partir de señales reales, solo lo recibe como parámetro. El estado "evidencia contradictoria" existe y se propaga fielmente (nunca se oculta), pero hoy depende de que algo aguas arriba lo declare explícitamente.
- **Versiona de verdad**: cuando una nueva recomendación para la misma actividad difiere en `strength`/`type` de la activa, la anterior pasa a `status:'superseded'` (`previous_version_id` la referencia). Si es idéntica, se reusa (`{created:false, reused: previous}`) — no se duplica.

## 4. Relación decisión → recomendación (verificación crítica)

**`recommendation.decision_id` existe como columna real** en la tabla `recommendations` y se persiste con el `decision.id` de la decisión que efectivamente generó esa fila. Pero la lectura personalizada (`core/profile/personalize.js#decisionsAndRecommendations()`, usada sin excepción por Radar, Situación e Informes) **resuelve la recomendación "vigente" de una decisión por `activity_id`, no comparando `recommendation.decision_id === decision.id`**:

```js
const recs = db.prepare('SELECT * FROM recommendations WHERE activity_id = ? ORDER BY created_at DESC').all(decision.activity_id);
const current = recs.find((r) => r.status === 'active') ?? null;
```

**Verificado en vivo** (no solo por lectura de código), ejecutando la secuencia real de fixtures `soja-precio.t1→t2→t2b→t2c→t3.json` sobre un perfil de 3 actividades: tras `t2b` y `t2c`, la **única decisión visible** para `elaboracion-aceites` a través de `GET /profiles/:id/radar` trae anidada una recomendación cuyo `decision_id` **pertenece a una decisión anterior, ya no visible** (`MATCH: false`). Recién con `t3` (que cambia de tipo/fuerza) se crea una recomendación nueva y vuelve a coincidir (`MATCH: true`).

```
after t2b { decision_id: '3eaf4f92…', rec_decision_id: '2f34b585…', MATCH: false }
after t2c { decision_id: 'e203ec80…', rec_decision_id: '2f34b585…', MATCH: false }
```

**Esto confirma y fortalece el GAP 17.7** ya congelado en `contrato-radar.md`/`contrato-informes.md`: no es un caso teórico raro — se reproduce con la misma receta de fixtures que el resto de la suite ya usa, y ocurre exactamente en el dato que la futura UI consumiría (`decisions[].recommendation`, dentro de `changes.items`/`radar`).

**Regla para 2F-1**: la interfaz **no puede afirmar** "esta recomendación fue generada por esta decisión" a partir del anidamiento por sí solo. Puede afirmar legítimamente:

> "recomendación vigente para esta actividad, asociada a esta situación/decisión"

nunca:

> "recomendación derivada específicamente de esta decisión"

salvo que se compare explícitamente `recommendation.decision_id === decision.id` (dato disponible en el objeto, aunque el backend no lo valida por sí solo) — en cuyo caso sí puede mostrarse un matiz como "recomendación actualizada desde una evaluación anterior" cuando no coincide, sin inventar un campo nuevo.

## 5. Datos disponibles para la UX

**Decisión**: qué ocurrió (`type`, `activity_id`, inteligencia de origen vía `triggered_by_intelligence_id`), alternativas consideradas completas (`alternatives[]`, incluida `no_action`), incertidumbre por alternativa (`uncertainty.status`), reversibilidad (`reversibility`), evidencia que la respalda (heredada de `intelligence.rationale`/`evidence_level` del padre), confianza (heredada de `intelligence.confidence`, no propia de la decisión). **No disponible**: `best_option`, `information_value` explícito, ningún score numérico.

**Recomendación**: qué se recomienda (`statement`, plantilla regulada), por qué (`rationale`, heredado de la inteligencia), para qué actividad (`activity_id`), evidencia (`evidence_level` propio, distinto del de `intelligence`), confianza/fuerza (`strength`), tipo (`type`), prioridad (`priority`), estado (`status`, `previous_version_id`), y su relación con la decisión **únicamente en la medida documentada en §4** (nunca como vínculo garantizado 1:1).

## 6. Estados reales

| Estado | Alcanzable | Verificado |
|---|---|---|
| Sin decisión (inteligencia sin decisión asociada) | **No** — `shouldTriggerDecision()` siempre `true`; toda inteligencia generada dispara una decisión | Lectura de código, sin excepción en `pipeline/orchestrator.js` |
| Decisión sin recomendación | **No observado como alcanzable** — `generateRecommendation()` se llama incondicionalmente tras cada decisión creada (`orchestrator.js:111`, sin `if` previo) | Lectura de código |
| Decisión con recomendación | Sí | Caso general, todos los tests |
| `no_action` | Sí, siempre presente como primera alternativa | `decision.js` (sin condición) |
| Información insuficiente | Sí (`evidence_level:'insufficient'`→`strength:'none'`/`'monitoring_only'`) | Código + `radar.test.js` Caso 13 |
| Evidencia contradictoria | Sí, pero **solo si el contexto del job la declara explícitamente** (`context.conflicting`), no autodetectada | `radar.test.js` Caso 9/19-conflicto, reejecutado (43/43 PASS) |
| Múltiples actividades | Sí — una misma señal produce decisiones/recomendaciones independientes por `activity_id`, sin fusión ni privilegio a la actividad principal | Verificado en vivo (§4) y `radar.test.js` Caso 5/23 |
| Recomendación inactiva/superseded | Sí, vía `status:'superseded'` + `intelligence[].decisions[].recommendation_history` — **no** aparece en `radar.recommendations` ni en `GET /profiles/:id/recommendations` (ambos filtran solo activas) | Verificado en vivo (§4) y `radar.test.js` Caso 11/22 |

## 7. Multiactividad

`decision.activity_id` y `recommendation.activity_id` mantienen separación estricta — confirmado en vivo (§4): `elaboracion-aceites`, `cultivo-soja` y `ganaderia-bovina-carne` reciben decisiones y recomendaciones completamente independientes a partir de la misma señal, sin duplicación de ids y sin que la actividad principal reciba ningún privilegio (`decision.js`/`recommendations.js` no referencian `is_primary_activity` en ningún punto — grep confirmado). No se repite el análisis exhaustivo ya cerrado en `contrato-radar.md` §10.

## 8. Endpoints necesarios

| Método | Ruta | Datos relevantes | Errores |
|---|---|---|---|
| GET | `/profiles/:id/radar` | Fuente recomendada: `changes.items[].intelligence[].decisions[]` (con `recommendation`/`recommendation_history`), ya usada por Situación | 404 `profile_not_found` |
| GET | `/profiles/:id/changes` | Mismo contenido que `radar.changes`, sin agregación de situaciones/riesgos/oportunidades/monitor | 404 `profile_not_found` |
| GET | `/profiles/:id/intelligence` | Lista plana de `intelligence`, **sin** `decisions` anidadas — insuficiente por sí sola para 2F | 404 `profile_not_found` |
| GET | `/profiles/:id/recommendations` | Lista plana de recomendaciones **activas únicamente** (vía `getChanges()`, sin el `Map` de deduplicación por id que sí usa `radar/build.js` — sin diferencia observable en la práctica, ninguna recomendación se comparte entre actividades) | 404 `profile_not_found` |
| GET | `/decisions`, `/recommendations` | Globales, sin filtrar por perfil, sin personalizar — solo depuración, **no aptos para 2F-1** | Ninguno propio |

**Conclusión**: `GET /profiles/:id/radar` (ya integrado en `api.js` como `getProfileRadar`) es suficiente y preferible — trae decisiones y recomendaciones completas anidadas en una sola llamada, igual que ya usa Situación. **No se requiere ningún endpoint nuevo.**

## 9. Trazabilidad

```
INTELLIGENCE (intelligence.id) → DECISION (decision.id, triggered_by_intelligence_id)
                                → RECOMMENDATION (recommendation.decision_id — verificar igualdad
                                  explícita contra decision.id antes de afirmar autoría directa, §4)
```

IDs disponibles en la respuesta: `decisions[].id`, `decisions[].triggered_by_intelligence_id`, `decisions[].recommendation.id`, `decisions[].recommendation.decision_id`, `decisions[].recommendation.previous_version_id`, `decisions[].recommendation_history[].id`. No existe endpoint de trazabilidad dedicado a Decisiones/Recomendaciones fuera de perfil (el de Informes, `GET /reports/:id/traceability`, es un concepto distinto, ya congelado).

## 10. GAPs relevantes para 2F

| # | Origen | GAP | Relevancia para 2F-1 |
|---|---|---|---|
| 17.7 | `contrato-radar.md`/`contrato-informes.md`, **reconfirmado en vivo aquí** | `decision→recommendation` se resuelve por `activity_id`, no por `decision.id` exacto — reproducido con la receta estándar de fixtures (t2b/t2c) | **Alta** — define el lenguaje permitido en la UI (§4); no bloquea, pero condiciona cómo se redacta la relación |
| 12.2 | `contrato-situacion.md`/`contrato-radar.md`, **extendido aquí** | `constraints` del perfil no influyen en relevancia NI en las `alternatives[].constraints` de la decisión (que son categorías fijas por `intel.type`, no derivadas del perfil) | Media — 2F-1 no debe presentar `alternatives[].constraints` como si reflejaran las restricciones declaradas por el usuario |
| 17.6 | `contrato-radar.md` | Sin campo `information_value` explícito en decisión/alternativas | Baja — no inventar ese dato si se diseña una sección de "valor de información" |
| 17.8 | `contrato-radar.md`/`contrato-informes.md` | `defer` catalogado pero nunca producido | Baja — no incluirlo como tipo real alcanzable en filtros/leyendas |
| Nuevo (menor) | Este documento | Decisión no tiene ciclo de vida propio (`status` siempre `'open'`) — solo la recomendación versiona | Baja — no diseñar un estado "decisión cerrada/resuelta" inexistente |

Ningún GAP es crítico ni contradice el contrato — ninguno impide diseñar 2F-1.

## 11. Límites conocidos

- No existe endpoint personalizado dedicado a decisiones (`/profiles/:id/decisions`) — solo llegan anidadas.
- `decision.status` no aporta información útil hoy (constante `'open'`); el único ciclo de vida real observable es el de `recommendation.status`.
- La relación decisión→recomendación no es una garantía estructural sino una coincidencia frecuente — ver §4 para el lenguaje correcto a usar en la interfaz.

---

**RESULTADO: GREEN WITH GAPS** — el contrato es suficientemente claro y estable para diseñar 2F-1. El único punto que exige una decisión de diseño explícita es el lenguaje de la relación decisión→recomendación (§4), ya resuelto en este documento con una regla concreta y verificada en vivo.
