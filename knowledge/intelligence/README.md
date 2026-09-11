# knowledge/intelligence/

## Propósito

`intelligence/` transforma señales ya contextualizadas por `relevance/` en **conocimiento productivo estructurado, trazable y proporcional a la evidencia**. Responde:

> ¿Qué está ocurriendo? ¿Para qué actividad importa? ¿Qué significa en ese contexto? ¿Qué evidencia lo sustenta? ¿Qué otros cambios están relacionados? ¿Qué impactos o escenarios pueden considerarse?

**Nunca** responde "¿qué debe hacer el productor?" — eso es `decision/`.

```
activities → ramifications → domain-names → sources → monitoring → cambios → signals → relevance → INTELLIGENCE → decisión
```

## Distinción fundamental

```
DATO ≠ CAMBIO ≠ SEÑAL ≠ RELEVANCIA ≠ INTELIGENCIA ≠ RECOMENDACIÓN ≠ DECISIÓN
```

`intelligence/` no genera texto narrativo como mecanismo principal: la unidad fundamental es una **estructura de conocimiento** (evidencia + relaciones + contexto + análisis + conclusión estructurada); un texto en español correcto puede generarse *a partir* de esa estructura después, no al revés.

## Estructura

```
intelligence/
├── README.md
├── intelligence-types.json   # 4 tipos (trend/impact/risk/opportunity) + 3 candidatos descartados + 6 dimensiones
├── rules.json                  # unit_schema + 4 dimensiones de confianza + direction_by_subject + 2do orden + dedup + update policy
├── relationships.json           # 7 tipos de relación señal↔señal / evidencia↔evidencia + heurística reinforces/counteracts
├── evidence.json                 # 7 tipos de evidencia, cada uno apuntando a una capa anterior (sin copiar datos)
├── scenarios.json                 # metodología (base/favorable/adverso) - 0 instancias, no existen señales en vivo
├── gaps.json                       # gap estructural principal (no hay datos en vivo) + limitaciones de clasificación + 1 GAP corregido en relevance/
├── _index.json                     # recuentos
└── _build/                         # generate.py (reproducible, solo lectura de relevance/, signals/, ramifications/)
```

## Los 4 tipos (de 17 candidatos evaluados)

`trend`, `impact`, `risk`, `opportunity`. **`context` no es un tipo**: es un campo obligatorio de todo unit (`rules.json.unit_schema.context`). Los 12 candidatos restantes (`market`, `cost`, `supply`, `demand`, `competitive`, `regulatory`, `climate`, `sanitary`, `financial`, `logistics`, `technological`, `strategic`) se descartaron por ser el **tema** (`topic_id`, ya catalogado en `ramifications/_signal_types.json` y reusado por `signals/` y `relevance/` — crear un tipo por tema lo habría duplicado por tercera vez) o un **horizonte de alcance** (`strategic` → `dimensions.scope`), no una forma de conocimiento distinta.

## Las 6 dimensiones (nunca mezcladas)

| Dimensión | Vocabulario | Reusa de |
|---|---|---|
| `epistemic_status` | `observed/derived/estimated/projected/inferred` + `scenario` | `signals/signal-types.json.dimensions.provenance` (extendido) |
| `impact_direction` | `positive/negative/mixed/neutral/uncertain` | nuevo, siempre relativo a un sujeto explícito |
| `horizon` | `past/current/near_term/medium_term/long_term/unknown` | nuevo |
| `scope` | `operational/tactical/strategic` | nuevo (reemplaza al candidato "strategic" como tipo) |
| `unit_status` | `draft/insufficient_evidence/context_only/validated/superseded/expired/dismissed` | nuevo |
| `evidence_level` | `direct_evidence/multiple_sources/historical_pattern/structural_relationship/inference/scenario` | nuevo |

## Confianza: 4 campos separados, nunca un número único

| Campo | De dónde sale |
|---|---|
| `source_quality` | `sources.json[source_id].quality.reliability` |
| `change_detection_confidence` | método de `monitoring/change-detection.json` (`hash_comparison`→`low`, coherente con `signals/rules.json`: no distingue cambio sustantivo de cosmético) |
| `relevance_confidence` | tipo de arista de `relevance/mappings.json` (directa=`high`, heredada por jerarquía=`medium`, `domain_coexposure`=`low`) |
| `analysis_confidence` | propio de esta capa: función de cantidad de señales independientes y de si la clasificación costo/ingreso es ambigua |

## `direction_by_subject`: el mismo cambio, distinto sentido según quién lo recibe

1. **Sentido base** — la `category` de la ramificación de origen (`ramifications/<activity>.json`) lo determina: 8 categorías de costo (`cost_factors`, `inputs`, `labor_factors`, `financial_factors`, `resources`, `suppliers`, `services`, `logistics`), 4 de ingreso (`products`, `markets`, `demand_factors`, `customers`), 13 sin sentido económico claro (`climate_factors`, `regulatory_factors`, `risks`, `opportunities`, etc. — quedan `uncertain` para efectos de costo/ingreso, pero **no** para riesgo/oportunidad, ver más abajo).
2. **Propagación a 1 salto** — atravesar una relación `supplier`/`customer` de `relevance/mappings.json` **invierte** el sentido (lo que es ingreso para un lado de una transacción es costo para el otro); atravesar `infrastructure`/`competitor`/`related_activity`/`complement` deja el sentido en `uncertain`.
3. **Límite explícito a 2 saltos** — la inversión solo es válida a un salto: la segunda transacción de una cadena (p. ej. elaboración de aceite vendiendo a biocombustibles) es una operación distinta de la primera (comprar soja), así que un efecto de 2do orden **siempre** tiene `impact_direction=uncertain` salvo que se declare explícitamente como supuesto de escenario (`scenarios.json`) — nunca como hecho estructural.

## Caso crítico — ganadería + soja (verificado con datos reales de `ramifications/`)

**Señal 1 — sanidad animal**: `brote-aftosa` es una ramificación real de `ganaderia-bovina-carne` (heredada de `ganaderia`) con `category=risks`, `relevance=critical`. → `direct_dependency`: **type=risk, scope=strategic, confianza alta** (la clasificación de riesgo viene directamente de `ramifications/`, no se re-deriva). Propagación a `cultivo-soja`: no existe ninguna arista `ganaderia-bovina-carne → cultivo-soja` en `relevance/mappings.json` → **`none`**, sin inteligencia generada para soja (confirma el Caso 5 de `relevance/README.md`).

**Señal 2 — precio de la soja** (`category=products` en `cultivo-soja`, dirección `increase`):

| Actividad | Salto | Relación | Sentido propagado | `impact_direction` | Tipo resultante |
|---|---|---|---|---|---|
| `cultivo-soja` (origen) | 0 | `direct_dependency` | revenue_side | **positive** | `opportunity` |
| `elaboracion-aceites` | 1 | `customer` (compra soja) | cost_side (invertido) | **negative** | `risk` ("riesgo potencial de aumento de costo de insumo") |
| `ganaderia-bovina-carne` | 1 | `related_activity` (heredado por jerarquía, débil) | — | **uncertain** | `impact` únicamente, nunca `risk`/`opportunity` (fundamento débil, ver `rules.json.risk_opportunity_criteria`) |
| `biocombustibles` | 2 (vía `elaboracion-aceites`) | `customer` de una transacción distinta | — | **uncertain** por regla de 2do orden | `impact` únicamente |

Esto demuestra exactamente lo pedido en el prompt (§49, §18): **la misma señal produce interpretaciones distintas según la actividad**, sin inventar una cadena de causalidad de costos a lo largo de 2 saltos, y sin escalar a `risk`/`opportunity` una relación débil solo porque la actividad es la "principal" del perfil.

## Riesgo y oportunidad: dos vías de evidencia, nunca inventadas

```
type=risk        si  category_origen == "risks"           (ya curado en ramifications/)
                 O   impact_direction == "negative" con evidence_level >= structural_relationship

type=opportunity si  category_origen == "opportunities"    (ya curado en ramifications/)
                 O   impact_direction == "positive" con evidence_level >= structural_relationship

en cualquier otro caso -> type=impact, impact_direction=uncertain (nunca forzado)
```

`ganaderia-bovina-carne` (heredada de `ganaderia`) ya tiene, en `ramifications/`, nodos reales `category=risks` (`brote-aftosa` crítico, `evento-climatico-adverso` alto, `cierre-o-restriccion-de-mercados` alto, `caida-de-precios-internacionales` alto, `concentracion-de-la-demanda-en-china` alto) y `category=opportunities` (`apertura-de-nuevos-mercados`, `suba-sostenida-de-precios`, `carne-baja-emisiones`, medios) — `intelligence/` **reusa** esa clasificación ya hecha por `ramifications/` en vez de reinterpretarla.

## Relaciones entre señales (`relationships.json`)

**7 tipos**: `derived_from`, `depends_on`, `related_to`, `reinforces`, `counteracts`, `supports`, `contradicts`. Ejemplo del prompt §21, verificado con la clasificación de esta capa:

```
señal A: costos ↑        (category=cost_factors, increase)  → sentido: negative
señal B: precio de venta ↑ (category=products,   increase)  → sentido: positive
resultado: counteracts (sentidos opuestos sobre la misma actividad)
```

El sistema **nunca** concluye cuál domina (prompt §21) — solo estructura que interactúan.

## Tendencias

`intelligence/` **no redetecta** tendencias: reusa `signals/rules.json:tendencia-por-persistencia` (≥3 observaciones consecutivas, sin reversión) como precondición obligatoria del tipo `trend`. Sin esa precondición, el resultado es `insufficient_evidence`, nunca una tendencia con una sola observación (Caso 4).

## Escenarios (`scenarios.json`)

Metodología (`escenario_base`/`escenario_favorable`/`escenario_adverso`) definida pero con **0 instancias**: se activan solo cuando existen ≥2 señales relacionadas (`reinforces`/`counteracts`) con `evidence_level>=structural_relationship` en ambas — no se genera un escenario por defecto para cada señal (prompt §23). No existen señales en vivo en el repositorio todavía (ver Gaps).

## Trazabilidad

```
INTELLIGENCE → SIGNAL → CHANGE → CAPTURE → RESOURCE → SOURCE → INSTITUTION
   (evidence.json.traceability_chain.to_source, vía signals/mappings.json.join_path)

INTELLIGENCE → RELEVANCE → ACTIVITY → RAMIFICATION → DOMAIN
   (evidence.json.traceability_chain.to_productive_structure, vía relevance/mappings.json)
```

Con varias señales: `INTELLIGENCE ├─ SIGNAL A ├─ SIGNAL B └─ SIGNAL C` — todas las referencias se conservan en `evidence[]`, ninguna se copia (`evidence.json.no_copy_rule`).

## Deduplicación y actualización

Clave: `(type, primary_activity_id, topic_id, señales base ordenadas)`. Una nueva evaluación sin evidencia nueva → `unit_status=persistent`, no un unit nuevo (Caso 11). Evidencia nueva que cambia la interpretación → `intelligence_update` con `previous_version_id`, `new_evidence[]`, `reason`, `updated_at` — nunca se sobrescribe silenciosamente un unit `validated` (Caso 10, prompt §34).

## Prioridad de inteligencia ≠ prioridad de señal ≠ relevancia de perfil

`intelligence_importance` es un campo propio (misma escala de 5 niveles por consistencia, pero **no** copiado ni promediado desde `relevance_level` ni desde la prioridad de la fuente en `sources/`/`monitoring/`) — función de tipo (`risk`/`opportunity` pesan más que `impact`/`trend`), `analysis_confidence`, `evidence_level` y cantidad de señales independientes.

## Self-loops heredados (prompt §54)

Los 3 self-loops de `ramifications/` (`agencias-operadores`, `alojamiento`, `cosecha-forestal`) ya estaban excluidos del grafo de `relevance/mappings.json`. Durante la construcción de esta capa se detectó que la **propagación jerárquica** de `relevance/` podía *sintetizar* un self-loop nuevo no presente en `ramifications/` (`turismo → alojamiento` se propagaba como `alojamiento → alojamiento`) — ver "Problemas detectados" más abajo. Corregido en `relevance/_build/generate.py`; verificado que `relevance/mappings.json` ya no contiene ningún self-loop (validación automática en `intelligence/_build/generate.py`, 0 errores).

## Gaps (`gaps.json`)

- **Gap estructural principal**: no existe ninguna instancia real de señal/cambio en el repositorio — `monitoring/`, `signals/`, `relevance/` e `intelligence/` son las cuatro capas de configuración/metodología construidas hasta ahora, no datos en vivo. Los casos de prueba de este README se verifican con datos **estructurales reales** (`ramifications/`, `relevance/mappings.json`), no con una captura observada real.
- **13/25 categorías de `ramifications/`** no tienen sentido costo/ingreso determinable de forma genérica → `impact_direction=uncertain` para esas señales, nunca se fuerza una dirección.
- **2do orden deliberadamente no materializado**: una expansión completa generaría ~9.000 pares candidatos (vs. ~939 de 1er orden) — se calcula bajo demanda.
- Se reafirman, sin recorregir, los gaps ya conocidos de `domain-names/`, `signals/` y `relevance/` (granularidad de mercado).

## Problemas detectados

**1 GAP DETECTADO Y CORREGIDO** (documentado en `relevance/gaps.json.propagation_self_loop_bug` y en `relevance/README.md`): la propagación jerárquica de `relevance/_build/generate.py` podía sintetizar un self-loop (`X → X`) cuando el hijo propagado coincidía con el otro extremo de la arista (ejemplo real: `turismo → alojamiento` generaba `alojamiento → alojamiento`). Se agregó un guard de una línea (`if child == e[...]: continue`) en el paso de propagación. Corrección mínima e indispensable: sin ella, `intelligence/` no podía garantizar la exclusión de estos casos de sus relaciones transitivas, requisito explícito del prompt (§54). `relevance/` se regeneró (939 pares en vez de 944, 0 self-loops) y su reporte de cierre queda desactualizado en ese detalle numérico — corregido aquí en `relevance/README.md`.

## Búsqueda externa

Ninguna. Todo se construyó leyendo `activities/`, `ramifications/`, `domain-names/`, `sources/`, `monitoring/`, `signals/` y `relevance/` ya existentes.

## Qué NO contiene

`decision/`, recomendaciones, acciones, estrategias, pronósticos con probabilidad sin base estadística real, informes personalizados, notificaciones, dashboards, monitores o perfiles nuevos, ni ninguna instancia real de inteligencia (no existen señales en vivo).

## Estado

`knowledge/intelligence/` queda cerrado como capa de interpretación contextual. No se construyó `decision/`. Se modificó `knowledge/relevance/_build/generate.py` (corrección mínima documentada arriba); ninguna otra capa anterior fue modificada.
