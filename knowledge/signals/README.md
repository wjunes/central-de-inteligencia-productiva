# knowledge/signals/

## Propósito

`signals/` transforma determinados **cambios detectados** por `knowledge/monitoring/` en **señales productivas estructuradas**. Responde:

> De todo lo que `monitoring/` detectó que cambió, ¿qué constituye realmente una señal productiva, de qué naturaleza, sobre qué tema, con qué magnitud y con qué trazabilidad?

```
activities → ramifications → domain-names → sources → monitoring → cambios → SIGNALS → relevancia → inteligencia → decisión
```

Es conocimiento y reglas de clasificación — **no runtime**: no contiene instancias de señales, historial, ni resultados de ejecuciones. No determina para quién es relevante una señal (`relevance/`), no interpreta su significado en contexto ni sus consecuencias (`intelligence/`), y no genera alertas, recomendaciones ni decisiones.

## Definición de señal productiva

> Un cambio, patrón o condición observable y verificable, detectado a partir de información monitoreada, que posee suficiente significado potencial para una o más actividades productivas y que merece ser evaluado posteriormente por `relevance/`.

Una señal **no** es una noticia, un dato bruto, cualquier modificación técnica de una fuente, una recomendación, una predicción, una decisión, una conclusión personalizada, una opinión del modelo ni una alerta al usuario.

**Regla fundamental: no todo cambio es una señal.**

```
CAMBIO DETECTADO → EVALUACIÓN → ¿es significativo?
                                   ├── NO → se registra el cambio, sin señal
                                   └── SÍ → SEÑAL
```

## Estructura

```
signals/
├── README.md
├── signal-types.json    # 5 tipos (naturaleza del cambio) + candidatos descartados + dimensiones (direction/provenance/status)
├── rules.json            # 10 reglas change_class → señal/no_señal/pendiente + deduplicación + agrupación
├── thresholds.json        # tipos de umbral (referencia a monitoring/), piso de ruido, y valores dejados pendientes a propósito
├── mappings.json          # índice inverso topic → monitores + documentación de las rutas de join (no duplica taxonomías)
├── gaps.json               # los 10 gaps de monitoring/gaps.json traducidos a soporte real de señal + 1 gap adicional detectado
├── _index.json             # recuentos
└── _build/                 # generate.py (reproducible, solo lectura de monitoring/ y sources/)
```

No se creó un `signal-schema.json` aparte: el esquema de una señal (ilustrativo, sin instancias reales) se documenta más abajo en este README, igual que `monitoring/README.md` documenta su esquema de monitor sin un archivo dedicado.

## Relación con `monitoring/`

Las entradas son los `change_class` de `monitoring/change-detection.json`:

- `valor_modificado`, `nuevo_registro`, `registro_eliminado`, `estructura_modificada`, `cambio_de_contenido` → **pueden** producir señal (ver `rules.json`).
- `sin_cambio`, `fuente_no_disponible`, `error_de_adquisicion` → eventos técnicos de adquisición, **nunca** se estructuran como señal productiva (se conservan para observabilidad operativa de `monitoring/`, no se reinterpretan aquí).

## Relación futura con `relevance/`

`signals/` estructura y clasifica el cambio (qué tipo de evento, sobre qué tema, con qué magnitud, con qué trazabilidad). **No decide para quién importa** ni con qué grado de relevancia — eso es responsabilidad exclusiva de `relevance/`, que se apoyará en `related_activities`/`related_domains`/`related_ramifications` de cada señal más el perfil productivo del usuario (que no existe en esta capa).

## Tres dimensiones independientes de una señal

Una señal se clasifica en tres ejes que **no se mezclan** (evita la proliferación de tipos tipo `precio-alza`/`precio-baja`/`cambio_de_precios`):

| Eje | Vocabulario | Dónde vive |
|---|---|---|
| `signal_type` (naturaleza del evento) | `cambio-significativo`, `nuevo-elemento`, `elemento-retirado`, `cambio-estructural`, `tendencia` | `signal-types.json` (nuevo, pequeño) |
| `topic_id` (tema) | 19 ids ya existentes: `precios`, `costos`, `oferta`, `demanda`, `regulacion`, `tecnologia`, `sanidad`, `clima-agua`, ... | `ramifications/_signal_types.json` (**reusado**, no duplicado) |
| `direction` (dirección del cambio) | `increase`, `decrease`, `new`, `removed`, `stable`, `accelerating`, `decelerating`, `unknown` | `signal-types.json.dimensions.direction` |

`riesgo` y `oportunidad` **no** son `signal_type`: calificar un cambio como riesgo u oportunidad requiere evaluar para quién y en qué contexto, lo cual pertenece a `relevance/`/`intelligence/` (documentado en `signal-types.json.excluded_as_types`).

## Reglas (`rules.json`)

10 reglas, una por combinación `change_class` × condición relevante, más una regla derivada de persistencia (`tendencia-por-persistencia`, que no parte de un `change_class` individual sino de una secuencia de señales ya estructuradas). Resultado posible: `signal`, `no_signal`, `pending_threshold`, `pending_validation`, `signal_candidate_requires_grouping`.

Ejemplo — `valor_modificado` no colapsa a una sola regla: si hay umbral y se supera → señal; si hay umbral y no se supera → sin señal; si **no hay umbral definido todavía** → `pending_threshold` (no se inventa un número, se deja pendiente y trazable).

## Umbrales (`thresholds.json`)

Los *tipos* de umbral (`absolute_threshold`, `relative_threshold`, `percentage_threshold`, `minimum_variation`) ya estaban tipados en `monitoring/change-detection.json` y no se redefinen aquí. Se agrega:

- un **piso de ruido** técnico (`minimum_variation`) para descartar variaciones por redondeo antes de evaluar cualquier umbral de negocio;
- perfiles orientativos por `volatility` (ya calculada en `monitoring/`), marcados `pending_definition_per_indicator`;
- `overrides: []` — **deliberadamente vacío**: ninguna capa anterior registra series históricas ni volatilidad medida (solo una clasificación cualitativa alta/media/baja), así que fijar un número ahora sería inventarlo. El esquema (`overrides_schema`) queda listo para completarse incrementalmente.

## Trazabilidad

Toda señal debe poder reconstruirse en dos cadenas, documentadas en `mappings.json.join_path` y usando **únicamente ids ya existentes** (ningún dato se copia):

```
señal → cambio → captura → recurso → fuente → institución
       (monitor_id → monitoring/monitors.json → source_id → sources/sources.json)

señal → dominio → actividad → ramificación
       (sources.json[source_id].domains/activities/ramifications)
```

`signals/` agrega únicamente el vínculo nuevo `cambio → señal`.

## Deduplicación y agrupación

- **Deduplicación** (`rules.json.deduplication`): clave `(monitor_id, indicador, período comparado, dirección)`. Una nueva captura idéntica en esa clave no genera una señal nueva — se trata como persistencia de la existente. Crítico para fuentes de alta frecuencia (`daily`/`every_6_hours`) con condición persistente.
- **Agrupación** (`rules.json.grouping`): varios cambios sobre el mismo dominio/período pueden compartir un `grouping_id`, conservando cada `change_id` original — sin afirmar causalidad entre ellos (ver sección de causalidad más abajo).

## Temporalidad y tendencias

Un cambio puntual **no** es una tendencia. `tendencia` requiere ≥3 señales `cambio-significativo` consecutivas, mismo monitor + indicador + dirección, sin reversión — un conteo de persistencia simple, sin algoritmos estadísticos. El mínimo (3) es un valor estructural por defecto, ajustable por dominio cuando haya evidencia (ver `thresholds.json`).

## Causalidad e interpretación

`signals/` **no infiere causalidad** por simultaneidad (`A causó B`). Dos cambios relacionados con el mismo dominio en el mismo período se registran como relacionados (`grouping_id`), no como causa-efecto. Tampoco convierte una estimación en un dato observado: toda señal declara su `provenance` (`observed`/`derived`/`estimated`/`projected`/`inferred`).

## Mercados y destinos

Se respeta el principio "país/mercado como dimensión": una señal puede llevar `related_markets` (usando los ids de `domain-names/mercados.json#mercados-destino.market_dimensions`, vía el `scope.parameters` del monitor de origen) — nunca se crea una señal por país ni una fuente por país.

## Gaps (`gaps.json`)

Los 10 gaps de `monitoring/gaps.json` se traducen a `signal_partially_supported` (los 10 tienen al menos un monitor proxy — `none_fully_unsupported: true`) con la restricción explícita de **no prometer una señal `critical`** sobre esos dominios sin documentar que la fuente es un proxy parcial.

Se detectó además un gap adicional, documentado en `gaps.json.additional_gap_detected` (no corregido aquí, ver sección "Problemas detectados" del informe final): 7 de los 19 `topic_id` del catálogo (`tecnologia`, `costos`, `infraestructura-logistica`, `recursos-naturales`, `financiamiento`, `sustitucion`, `empleo-talento`) no tienen **ninguna** fuente ni dominio que los declare en `sources.json[].signals` / `domain-names/*.related_signals`, por lo que el índice `mappings.json.by_topic` queda vacío para ellos aunque existan monitores relacionados en la práctica (p. ej. BCU para `financiamiento`).

## Límites de responsabilidad (qué NO hace esta capa)

No determina relevancia por perfil, no interpreta consecuencias ni escenarios, no genera recomendaciones ni decisiones, no crea perfiles de usuario, no notifica, no arma dashboards ni informes finales, no scrapea, no crea monitores/dominios/fuentes nuevos, no crea una señal por usuario.

## Casos de prueba (conceptuales, sobre datos reales del repositorio)

| # | Caso | Entrada | Resultado |
|---|---|---|---|
| 1 | Cambio irrelevante | `valor_modificado`, magnitud bajo el umbral aplicable | `no_signal` |
| 2 | Cambio significativo | `valor_modificado`, magnitud sobre umbral | `signal` (`cambio-significativo`) |
| 3 | Nuevo registro relevante | `nuevo_registro` vía `new_document_detection` (p. ej. `mgap-diea::anuario`) | `signal` (`nuevo-elemento`) |
| 4 | Fuente no disponible | `fuente_no_disponible` | evento técnico, **no** señal |
| 5 | Error de adquisición | `error_de_adquisicion` | evento técnico, **no** señal |
| 6 | Señal repetida | misma clave de deduplicación, mismo resultado, captura sucesiva | persistencia de la señal existente, no una señal nueva |
| 7 | Multiactividad | cambio en `inac::faena-y-precios` | una señal con `related_activities: [ganaderia-bovina-carne, frigorifica, ...]`, sin duplicarse |
| 8 | Mercado/destino | `inac::faena-y-precios`, `scope.parameters: [china, union-europea, ...]` | una señal por captura con `related_markets`, no una señal por país |
| 9 | Gap | dominio `precios-de-metales-y-siderurgia` (cobertura `partial`, proxy Banco Mundial) | `signal_partially_supported`, nunca se etiqueta implícitamente como soporte `critical` |
| 10 | Trazabilidad | cualquier señal | reconstruible vía `mappings.json.join_path` hasta institución y hasta ramificación, sin datos copiados |

## Cómo se construyó

`signal-types.json`, `rules.json` y `thresholds.json` son curados a mano dentro de `_build/generate.py` (criterio de diseño, no cálculo). `mappings.json` y `gaps.json` se derivan por *join* de ids ya existentes en `monitoring/` y `sources/` — ningún dato de capas anteriores se reescribe ni se recalcula con una heurística nueva (el único caso donde se consideró recalcular — un rollup de `topic` por dominio — se descartó a favor de reusar `sources.json[].signals`, ya oficial, documentando su limitación conocida en `gaps.json` en vez de reimplementar la lógica de `sources/`).

## Esquema de una señal (ilustrativo — no hay instancias en esta capa)

```json
{
  "id": "sig-2026-09-11-inac-precio-hacienda-000123",
  "signal_type": "cambio-significativo",
  "topic_id": "precios",
  "direction": "increase",
  "status": "detected",
  "provenance": "observed",
  "change": {
    "monitor_id": "inac::faena-y-precios",
    "change_class": "valor_modificado",
    "detected_at": "2026-09-11T00:00:00Z",
    "period_compared": "semana actual vs. semana anterior",
    "previous_value": 4.10,
    "new_value": 4.48,
    "unit": "USD/kg carcasa",
    "absolute_diff": 0.38,
    "relative_diff": 0.093,
    "threshold_applied": { "type": "percentage_threshold", "value": "pending_definition" }
  },
  "related_domains": ["complejo-carne-bovina", "precios-internacionales-de-commodities"],
  "related_activities": ["ganaderia-bovina-carne", "frigorifica"],
  "related_ramifications": ["ganado-en-pie"],
  "related_markets": ["china", "union-europea"],
  "related_signal_ids": [],
  "grouping_id": null,
  "dedup_key": "inac::faena-y-precios|precio-hacienda|2026-W37|increase",
  "valid_from": "2026-09-11",
  "valid_until": null
}
```

## Estado

`knowledge/signals/` queda cerrado como capa de clasificación de cambios en señales estructuradas. No se construyó `relevance/`, `intelligence/` ni `decision/`. No se modificó ninguna capa anterior.
