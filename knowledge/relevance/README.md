# knowledge/relevance/

## Propósito

`relevance/` determina **para qué actividad, ramificación o perfil productivo importa una señal, y con qué nivel**, usando exclusivamente relaciones estructurales ya existentes en el repositorio. Responde:

> De una señal ya estructurada por `signals/`, ¿a qué actividades afecta, con qué intensidad, y por qué?

```
activities → ramifications → domain-names → sources → monitoring → cambios → signals → RELEVANCE → intelligence → decisión
```

Es conocimiento y reglas de clasificación — **no runtime**: no contiene instancias de relevancia evaluada, no contiene perfiles productivos reales, no interpreta consecuencias ni genera recomendaciones.

## Distinción fundamental

```
CAMBIO ≠ SEÑAL ≠ RELEVANCIA ≠ INTELIGENCIA ≠ RECOMENDACIÓN ≠ DECISIÓN
```

`relevance/` responde **para quién importa y cuánto**, nunca **qué significa** ni **qué hacer**. Ejemplo (del prompt de construcción):

```
SEÑAL: precio internacional de la soja +7,8%
  → producción de soja:      crítica
  → ganadería bovina:        media/baja (vía costo de alimentación)
  → software:                ninguna
```

Nunca: *"el productor debería vender"* — eso es `intelligence/`/`decision/`.

## Estructura

```
relevance/
├── README.md
├── levels.json      # 5 niveles (critical/high/medium/low/none): significado, criterio, comportamiento esperado
├── rules.json         # 4 factores (trimmed de 16 candidatos) + tabla de decaimiento + propagación jerárquica + centro de gravedad + deduplicación
├── mappings.json       # DERIVADO: grafo actividad→actividad (944 pares) extraído de ramifications/, con nivel y evidencia
├── gaps.json             # anomalías/limitaciones detectadas (0 actividades aisladas; 3 self-loops heredados; granularidad de mercado)
├── _index.json            # recuentos
└── _build/                 # generate.py (reproducible, solo lectura de ramifications/)
```

## Unidad de relevancia

```
signal (topic_id + origen: actividad/ramificación/dominio, via signals/mappings.json)
  + target (activity_id | ramification_id | domain_id | market | productive_profile)
  + relevance_level (critical|high|medium|low|none)
  + reason (derivado de una relación estructural real)
  + evidence[] (aristas concretas de ramifications/ que lo justifican)
```

## Los 4 factores (de 16 candidatos evaluados, ver `rules.json.excluded_as_separate_factors`)

El prompt de construcción propuso 16 factores posibles. Se redujeron a **4**, no redundantes entre sí, cada uno con un mecanismo de cálculo distinto:

| Factor | Qué mide | ¿Se materializa? |
|---|---|---|
| `direct_dependency` | La actividad candidata **es** la actividad de origen de la señal | No — depende de la ramificación concreta de cada señal; se evalúa contra `ramifications/<activity_id>.json` en el momento |
| `value_chain_relation` | Vínculo estructural directo (proveedor/cliente/infraestructura/competidor/relacionada) vía `target_activity_id` de `ramifications/` | **Sí** — `mappings.json.activity_relevance_graph` (944 pares) |
| `domain_coexposure` | Ambas actividades comparten un dominio de `domain-names/` sin vínculo estructural directo | No — el producto actividad × actividad × dominio es combinatoriamente grande (algunos dominios transversales superan 90 actividades relacionadas); se evalúa en el momento contra `domain-names/*.json[domain].related_activities` |
| `market_exposure` | La señal tiene mercado/destino y la actividad candidata está expuesta a ese mismo mercado | No — hoy la exposición a mercado solo existe a nivel de fuente (`sources.json[].markets`, ~10/77) y de dominio, no por actividad individual (ver `gaps.json`) |

`cost_exposure`, `risk_exposure`, `opportunity_exposure`, `regulatory_exposure`, `climate_exposure`, `sanitary_exposure`, `logistics_exposure`, `financial_exposure`, `demand_exposure`, `input_dependency`, `output_dependency`, `indirect_dependency`, `technology_dependency` se descartaron como factores propios: son o bien subtipos de `value_chain_relation`/`domain_coexposure` ya distinguibles por `relation`/`topic_id` (que vive en `signals/`, no se duplica aquí), o bien requieren interpretación de contexto (`riesgo`/`oportunidad`) que corresponde a `intelligence/`.

## Cómo se construyó `mappings.json` (el grafo actividad→actividad)

`ramifications/` ya contiene, de forma implícita, un grafo dirigido: cada nodo con `target_activity_id` es una arista de la actividad que lo declara hacia otra actividad, con un `relation` (proveedor/cliente/infraestructura/competidor/actividad relacionada) y una `relevance` propia. Se extrajeron **713 aristas directas** (excluidas 3 con `target_activity_id` igual a la propia actividad — ver `gaps.json.self_loop_anomaly`) y se aplicó:

1. **Tabla de decaimiento** — una relación fuerte (`supplier`/`customer`/`infrastructure`/`competitor`) decae un escalón desde el `relevance` de la arista de origen (p. ej. `critical`→`high`); una relación débil (`related_activity`/`complement`) decae dos escalones (p. ej. `high`→`low`). Una arista `indirect` decae un escalón adicional. Ninguna arista existente decae hasta `none` (una arista siempre es evidencia de al menos `low`).
2. **Propagación jerárquica** (366 aristas adicionales) — si una arista involucra una actividad con subactividades (p. ej. `ganadería`), se propaga sin decaimiento adicional a cada subactividad, salvo que la subactividad ya tenga su propia arista más específica. Es la misma semántica de herencia ya definida en `ramifications/` (`inherits_from`), aplicada a aristas entrantes/salientes.
3. **Deduplicación** — un único registro por par `(origen, destino)`: si hay varias razones, se conserva el nivel máximo y se listan todas como `evidence[]`.

Resultado: **944 pares actividad→actividad** con relevancia derivada (57 `high`, 182 `medium`, 705 `low`; 0 `critical` — `critical` solo puede surgir de `direct_dependency`, que no se materializa aquí porque depende de la señal concreta).

## Caso crítico — ganadería + soja (verificado contra datos reales, prompt §39)

Perfil de ejemplo: actividad principal `ganaderia-bovina-carne`, secundaria `cultivo-soja`.

| Señal (origen) | `ganaderia-bovina-carne` | `cultivo-soja` | Por qué |
|---|---|---|---|
| Precio de la soja (origen: `cultivo-soja`) | **low** (`mappings.json`: `cultivo-soja → ganaderia-bovina-carne`, heredado vía `cultivo-soja → ganaderia`, `related_activity`) | **critical** (`direct_dependency`: la ramificación de origen es la propia soja) | La soja no es un insumo estructural declarado de la ganadería bovina en `ramifications/` — la relación existente es genérica (actividad relacionada del sector agropecuario), no proveedor de alimento balanceado. |
| Precio del maíz/sorgo (origen: `cultivo-maiz-sorgo`) | **low** (`ganaderia-bovina-carne → cultivo-maiz-sorgo` es `supplier`, `indirect`, `medium` → decae 2 escalones) | ninguna arista directa | Consistente con los datos reales: es *ganadería* la que declara a maíz/sorgo como proveedor, no al revés, y de forma indirecta. |
| Sanidad animal (origen: ramificación propia de `ganaderia-bovina-carne`) | **critical/high** (`direct_dependency`, según el `relevance` de esa ramificación puntual) | **none** (sin arista, sin dominio sanitario compartido con `cultivo-soja`) | Confirma el ejemplo del prompt §14: una señal sanitaria bovina no traslada relevancia a la soja. |

Este resultado confirma lo pedido en el prompt: **la misma señal no recibe automáticamente la misma relevancia en ambas actividades**, y la actividad principal (`ganaderia-bovina-carne`) no recibe relevancia máxima solo por serlo (ver `rules.json.center_of_gravity`).

## Centro de gravedad

La actividad principal de un perfil **no** recibe relevancia elevada automáticamente (prohibido explícitamente en el prompt §14, verificado arriba: la soja es `low` para ganadería bovina pese a ser la secundaria "obvia"). El único efecto de ser la actividad principal es una etiqueta `is_primary_activity: true` en el resultado por perfil (`rules.json.profile_relevance`), que capas posteriores pueden usar para **ponderar**, no para **inflar**, al agregar varias señales simultáneas.

## Personalización sin duplicar señales

```
FUENTE → MONITOR → CAMBIO → SEÑAL → RELEVANCE (grafo actividad→actividad, calculado UNA vez) → evaluado contra N perfiles
```

Un perfil se define como `{main_activity_id, secondary_activity_ids: []}` usando ids de `activities/` ya existentes (`rules.json.profile_relevance`) — no se crea una taxonomía de perfiles nueva, ni se evalúa la señal contra todas las actividades del país: se resuelve la(s) actividad(es) de origen de la señal (vía `signals/mappings.json`) y se consulta `mappings.json.activity_relevance_graph[origen]`, que ya está acotado. No se instancian perfiles reales en esta capa: no existen perfiles productivos en el repositorio todavía.

## Mercados

Se respeta `markets = dimensión`: no hay una entrada de relevancia por país. La regla `market_exposure` (condicional, no materializada) eleva un escalón el nivel ya calculado por los otros factores cuando el `topic_id` de la señal es de comercio exterior/acceso a mercados/precios/demanda **y** ambas actividades comparten mercado — usando `sources.json[].markets` y `domain-names/mercados.json#mercados-destino.market_dimensions` ya existentes, sin crear una fuente ni un dominio por país.

## Trazabilidad

```
perfil → relevancia → señal → cambio → captura → recurso → fuente → institución
       (usa signals/mappings.json.join_path, sin modificarlo)

relevancia → actividad → ramificación → dominio
       (mappings.json.activity_relevance_graph[origen][].evidence[].ramification_id
        + domain-names/*.json vía sources.json[source_id].domains, sin copiar datos)
```

## Deduplicación

Un único registro por `(origen, destino)` en `mappings.json` (ver "Cómo se construyó"). No se crea una relación por señal ni por perfil: la relación actividad→actividad es estable y se calcula una sola vez; lo que varía por señal es únicamente qué actividad de origen dispara la consulta.

## Gaps (`gaps.json`)

- **0 actividades aisladas** (las 115 actividades/subactividades tienen al menos una arista, directa o heredada).
- **3 self-loops heredados** de `ramifications/` (`agencias-operadores`, `alojamiento`, `cosecha-forestal`: un nodo de `value_chain` con `target_activity_id` igual a su propia actividad) — excluidos del grafo, no corregidos (capa `ramifications/` cerrada).
- **Granularidad de exposición a mercado**: no existe hoy un campo "actividad expuesta a mercado X" a nivel de `ramifications/`/`activities/`, solo a nivel de fuente y de dominio — la regla `market_exposure` es necesariamente aproximada.
- **Ramificación de destino no siempre disponible**: cada arista conoce la ramificación exacta de ORIGEN pero solo la ACTIVIDAD de destino (no una ramificación de destino específica) — limitación real de granularidad, documentada para que `intelligence/` no asuma más precisión de la que existe.
- Se reafirman (sin recorregir) los gaps ya conocidos: `barreras-y-requisitos-de-acceso` (`domain-names/`) y la cobertura parcial de 7/19 `topic_id` en `signals/gaps.json`.

## Casos de prueba (conceptuales, verificados contra datos reales)

| # | Caso | Resultado |
|---|---|---|
| 1 | Relevancia crítica | `direct_dependency`: actividad de origen con ramificación `relevance=critical` |
| 2 | Relevancia alta | vínculo `supplier`/`customer`/`infrastructure`/`competitor` con `edge_relevance=high` sin decaimiento, o `critical` decaído un escalón |
| 3 | Relevancia media | vínculo fuerte muy decaído, o `related_activity` de peso alto (p. ej. `cultivo-soja → elaboracion-aceites`: `medium`... en la práctica calculó `high`, ver mappings.json) |
| 4 | Relevancia baja | `related_activity` decaído, o `domain_coexposure` (regla, no materializada) |
| 5 | Sin relevancia | sanidad bovina → `cultivo-soja`: `none` (verificado arriba) |
| 6 | Multiactividad | una señal de `combustibles-liquidos` (dominio con 30 `related_activities` en `domain-names/_index.json`) es relevante para transporte, pesca, ganadería, etc. sin duplicarse — vía `domain_coexposure`, no vía una arista por actividad |
| 7 | Principal + secundaria | ver caso ganadería + soja arriba: mismo signal, `critical` vs. `low`/`none` según la actividad |
| 8 | Ramificación específica | `direct_dependency` distingue la ramificación exacta de origen (p. ej. `ganaderia-bovina-carne` tiene decenas de ramificaciones con `relevance` propia; una señal sobre una sola de ellas no eleva las demás) |
| 9 | Mercado | `market_exposure`: una señal sobre China es relevante para actividades con `china` en `sources.json[].markets` que las cubre (p. ej. `ganaderia-bovina-carne`/`frigorifica` vía INAC), no para todas las exportadoras |
| 10 | Gap | 3 self-loops y la granularidad de mercado se documentan como gap, no se rellenan con una relevancia inventada |

## Cómo se construyó

`levels.json` y `rules.json` son curados a mano en `_build/generate.py` (criterio de diseño: qué factores, cómo decaen, cómo se propagan por jerarquía). `mappings.json` es **derivado**: no se inventó ninguna relación — se extrajo el grafo ya implícito en `ramifications/` (`target_activity_id`) y se le aplicó la tabla de decaimiento curada. Se evaluó materializar también `domain_coexposure` como tabla y se descartó explícitamente por explosión combinatoria (documentado en `rules.json.factors`).

## Qué NO contiene

Instancias de relevancia evaluada, perfiles productivos reales, interpretación de consecuencias, recomendaciones, decisiones, pronósticos, notificaciones, dashboards, informes personalizados, monitores o señales por usuario, dominios o fuentes nuevas.

## Estado

`knowledge/relevance/` queda cerrado como capa de clasificación de relevancia. No se construyó `intelligence/` ni `decision/`. No se modificó ninguna capa anterior.
