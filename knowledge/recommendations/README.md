# knowledge/recommendations/

## Propósito

`recommendations/` transforma estructuras de `decision/` **suficientemente fundamentadas** en recomendaciones productivas explícitas, trazables, condicionadas y explicables. Responde:

> Con la evidencia disponible, para esta actividad y bajo estas condiciones, ¿cuál es la alternativa que resulta razonable considerar, cuáles son sus fundamentos, sus riesgos y las incertidumbres que deben vigilarse?

**Nunca** ejecuta, ordena, notifica, ni modifica ningún estado externo.

```
activities → ... → signals → relevance → intelligence → decision → RECOMMENDATION → acción
```

Esta capa llega hasta `RECOMMENDATION`. La ejecución de una acción queda explícitamente fuera.

## Principio fundamental

```
DATO ≠ CAMBIO ≠ SEÑAL ≠ RELEVANCIA ≠ INTELIGENCIA ≠ DECISIÓN ≠ RECOMENDACIÓN ≠ ACCIÓN
```

> Una recomendación es una propuesta de curso de acción derivada de una **decisión evaluada**, sustentada en evidencia suficiente, contextualizada para una actividad productiva y acompañada de sus condiciones, incertidumbres, fundamentos y límites.

```
INTELLIGENCE → DECISION → ALTERNATIVES → EVALUATION → RECOMMENDATION      ✓
INTELLIGENCE → RECOMMENDATION (sin decisión intermedia)                    ✗ nunca
RECOMMENDATION → AUTOMATIC ACTION                                          ✗ nunca
```

## Condición previa (prompt §2)

Una recomendación **nunca** se genera solo porque existe una señal, tendencia, riesgo, oportunidad o inteligencia. Debe existir un `decision/` `decision_problem` con al menos una alternativa `status != infeasible`. Sin esa estructura: `recommendation_status = not_supported`.

## Estructura

```
recommendations/
├── README.md
├── recommendation-types.json   # 8 tipos (de 10 candidatos) + 2 fusionados
├── criteria.json                 # escalera de proporcionalidad evidencia → fuerza (5 niveles) + regla de reversibilidad
├── evidence.json                   # trazabilidad + evidence_level (5 valores, coarsening de decision/)
├── conditions.json                  # esquema IF/AND/THEN referenciando señales/umbrales reales, nunca inventados
├── priority.json                     # recommendation_priority - el 5º concepto de prioridad del sistema
├── rules.json                         # precondición, esquema completo, lenguaje regulado, ciclo de vida, multiactividad, autonomía, IA
├── gaps.json                           # gap estructural + limitaciones heredadas + verificación Caso 14
├── _index.json                         # recuentos
└── _build/                             # generate.py (reproducible, solo lectura)
```

**No se creó `uncertainty.json` propio**: `decision/uncertainty.json` ya define exactamente el vocabulario que este prompt repite (`known/estimated/inferred/projected/scenario_dependent/unknown/conflicting` + 6 dimensiones) — se reusa por referencia (`rules.json.recommendation_schema.uncertainties`). Un archivo aparte solo habría duplicado el mismo contenido por segunda vez consecutiva.

## Los 8 tipos (de 10 candidatos)

`evaluate`, `prepare`, `mitigate`, `pursue_opportunity`, `adjust`, `defer`, `monitor`, `seek_information`. `prioritize` → se modela como campo (`priority.json`), no tipo. `review` → se modela como evento de ciclo de vida (`rules.json.lifecycle.update_policy.reassess`), no tipo. Ningún tipo está basado en actividad (nunca `recommendation_ganaderia`).

`monitor` vs. `seek_information`: distinción explícita — `monitor` observa un recurso **ya cubierto** por `monitoring/monitors.json`; `seek_information` señala un vacío informacional para el que **no existe** cobertura (referencia a `decision/rules.json.information_value`). Ninguno de los dos crea un monitor nuevo.

## Lenguaje de recomendación (prompt §6-7)

| `recommendation_strength` | Fórmula aprobada |
|---|---|
| `strong` | *"se recomienda evaluar..."* |
| `conditional` | *"si X se confirma, resulta conveniente evaluar Y..."* |
| `preventive` | *"conviene prepararse para..."* |
| `monitoring_only` | *"se recomienda monitorear..."* |
| `none` | *"no existe evidencia suficiente para recomendar una acción..."* |

Verbos explícitamente prohibidos: *debe hacer, haga inmediatamente, venda, compre, contrate, invierta, abandone, ejecute* (`rules.json.language_rules`, hereda y extiende `intelligence/rules.json.prohibited_language` y `decision/rules.json.prohibited_language` sin contradecirlos).

## Proporcionalidad: evidencia → fuerza (`criteria.json`)

```
evidence_level=strong  + status=candidate                     → strength=strong
evidence_level=moderate, o strong+is_contingent                → strength=conditional
evidence_level=limited + origen risk_response/category=risks   → strength=preventive
evidence_level=insufficient + recurso de monitoring/ existente → strength=monitoring_only
evidence_level=insufficient sin recurso, o conflicting, o
   todas las alternativas infeasible/not_comparable            → strength=none
```

**Regla de reversibilidad** (prompt §23): una alternativa `irreversible` nunca alcanza `strength=strong` salvo `evidence_level=strong` sin ninguna excepción (sin contingencias, sin constraints `unknown`, sin evidencia conflictiva).

## Caso crítico — ganadería + soja (extiende el caso de `decision/README.md`)

**Riesgo sanitario** (`brote-aftosa`, `ganaderia-bovina-carne`, `category=risks` en `ramifications/`, sin una señal observada que confirme un foco activo → `evidence_level=limited`):

| Recomendación | `type` | `strength` | Enunciado | Condición |
|---|---|---|---|---|
| R1 | `monitor` | `monitoring_only` | *"Se recomienda monitorear la evolución del estatus sanitario oficial."* | — (recurso ya existente: `mgap-dgsg::principal`) |
| R2 | `prepare` | `preventive` | *"Conviene prepararse para evaluar medidas preventivas específicas si se confirma un foco activo."* | `confirmacion-foco-aftosa` (ver `conditions.json.worked_example`), `status=unknown` |

**Oportunidad comercial** (precio de soja ↑, `direct_dependency` en `cultivo-soja`, `evidence_level=moderate` por falta de datos de ejecución de mercado):

| Actividad | Recomendación | `type` | `strength` | Enunciado |
|---|---|---|---|---|
| `cultivo-soja` | R3 | `evaluate` | `conditional` | *"Si se confirman las condiciones de mercado vigentes, resulta conveniente evaluar la oportunidad comercial de venta."* |
| `elaboracion-aceites` | R4 | `adjust` | `conditional` | *"Sería razonable analizar un ajuste en el abastecimiento de insumo ante el mayor costo esperado."* |
| `ganaderia-bovina-carne` | — | — | `none` | *"No existe evidencia suficiente para recomendar una acción"* — la única relación estructural es `related_activity` débil, heredada por jerarquía (`impact_direction=uncertain` en `intelligence/`); no se fuerza `mitigate` sin fundamento (`no_recommendation_triggers.uncertain_impact`). |

Esto demuestra, con datos reales de capas anteriores: Caso 1 (fundamentada), Caso 2/26 (`no_recommendation` explícito para `ganaderia-bovina-carne`), Caso 4 (condicionada, R2/R3), Caso 5 (riesgo→mitigación preventiva), Caso 6 (oportunidad, evaluada, no ordenada), Caso 7/18 (multiactividad: `cultivo-soja` ≠ `elaboracion-aceites` ≠ `ganaderia-bovina-carne`), Caso 10 (`monitor` en R1, sin inventar una acción).

## Prioridad (`priority.json`)

`recommendation_priority` es el **5º concepto de prioridad** del sistema, distinto de `signal priority` (`sources`/`monitoring`), `relevance_level`, `intelligence_importance` y del rol de la actividad (principal ≠ mayor prioridad automática, prompt §20 — verificado en el caso arriba: `ganaderia-bovina-carne`, aunque fuera la actividad principal de un perfil, recibe `none`, no una recomendación inflada). Sin fórmula numérica universal: factores documentados (`intelligence_importance`, `evidence_level`, reversibilidad, `inaction_cost`, horizonte, incertidumbre), nunca una ponderación fabricada.

## Vigencia y actualización

`status ∈ {active, expired, superseded, withdrawn, unsupported, pending_validation}` + `valid_from/valid_until/validity_condition/expiration_reason` — una recomendación condicionada a una situación temporal no queda activa indefinidamente. Nueva evidencia contradictoria → `update`/`supersede`/`withdraw`/`reassess`, conservando `previous_version_id` — nunca se oculta una recomendación anterior (prompt §14).

## Contradicciones

Evidencia contradictoria no resuelta → `strength ∈ {conditional, none}`, nunca `strong`. No se elige automáticamente la fuente favorable ni se usa IA para "resolver" la contradicción sin metodología (prompt §15).

## Autonomía y límites

Prohibido explícitamente: `automatic_execution`, `automatic_purchase`, `automatic_sale`, `automatic_investment`, `automatic_contract`, `automatic_transfer`, `automatic_regulatory_submission`, `automatic_message_to_third_party`. No se modifica `account`/`profile`/`financial_state`/`production_state`/`market_position`. No se almacenan perfiles individuales: el contexto de perfil se recibe como entrada, nunca se persiste aquí.

## Independencia de IA

Cero dependencias de proveedor en esta capa. La estrategia futura documentada (`DeepSeek API → OpenRouter (fallback) → evaluación futura de OpenAI/Anthropic`) queda solo como contexto (`rules.json.ai_provider_independence`), igual que en `decision/`.

## Trazabilidad

```
RECOMMENDATION → DECISION → INTELLIGENCE → RELEVANCE → SIGNAL → CHANGE → CAPTURE → RESOURCE → SOURCE
```

reconstruible por referencia, sin copiar datos (`evidence.json`).

## Self-loops (Caso 14)

Verificado automáticamente en `_build/generate.py`: `agencias-operadores`, `alojamiento`, `cosecha-forestal` siguen sin generar self-loops en `relevance/mappings.json` (0 casos) — sin cambios respecto de la corrección aplicada durante `intelligence/`.

## Búsqueda externa

Ninguna.

## Gaps (`gaps.json`)

- **Gap estructural** (heredado de toda la pirámide): no existen instancias reales de recomendación porque no existen instancias reales de señal/cambio.
- **Sin metodología de scoring** (heredado de `decision/`): `recommendation_priority`/`evidence_level` son escalas cualitativas documentadas, no puntajes calculados.
- **Cobertura de condiciones**: varias condiciones dependerán de fuentes manuales o de vacíos informacionales ya documentados — quedan `status=unknown` explícitamente.
- Se reafirman, sin recorregir, los gaps ya conocidos de `domain-names/`, `signals/`, `relevance/`, `intelligence/` y `decision/`.

## Qué NO contiene

`action`, ejecución de ninguna clase, notificaciones, UI, agentes autónomos, workflows de usuario, integración con proveedores de IA, perfiles de usuario reales, instancias de recomendación.

## Estado

`knowledge/recommendations/` queda cerrado como capa de propuesta de curso de acción evaluada. No se modificó ninguna capa anterior.
