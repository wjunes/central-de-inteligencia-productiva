# knowledge/sources/

## Propósito

`sources/` es el **mapa operativo entre necesidades de información y fuentes capaces de satisfacerlas**. No es un listado de organismos ni de URLs: responde

> ¿De dónde obtenemos cada información que necesitamos conocer, qué aporta exactamente cada fuente, cómo se accede a ella y qué prioridad y confiabilidad tiene?

Cadena conceptual:

```
actividad → ramificación → domain-name → información necesaria → FUENTE → recurso/endpoint → acceso → calidad → prioridad → (futuro) monitoreo
```

Se construyó **solo** a partir de `knowledge/activities/`, `knowledge/ramifications/` y `knowledge/domain-names/`, más validación puntual de existencia, autoridad y método de acceso. No incluye el motor de monitoreo, detección de cambios, señales, relevancia ni inteligencia.

---

## Principios aplicados

- **Fuentes primarias primero**: `primary_official` (organismos y registros oficiales uruguayos, u organismos internacionales cuando son la fuente primaria pertinente) → `primary_institutional` (institutos técnicos, gremiales, academia, organismos multilaterales) → `secondary_trusted` → `tertiary_exceptional` (evitada, solo con justificación).
- **Máxima cobertura con el mínimo conjunto suficiente**: una fuente que cubre varios dominios se registra **una vez** y se relaciona con todos. No se duplica una fuente por dominio ni por país de destino.
- **Los países son dimensiones de mercado**, no fuentes ni dominios. Una misma fuente (INAC, Uruguay XXI, Comtrade) cubre varios destinos.
- **No se ocultan los gaps**: un dominio sin fuente adecuada se documenta en `gaps.json` antes que incorporar una fuente débil para aparentar cobertura.
- `frequency` que se registra es **de publicación**, no de monitoreo (eso es de `monitoring/`).

---

## Estructura

```
sources/
├── README.md
├── _index.json        # recuentos, cobertura por tipo, lista de fuentes críticas
├── sources.json       # catálogo de fuentes (metadatos + relaciones)
├── mappings.json      # por dominio: fuente primaria, fallback y secundaria, y nivel de cobertura
├── gaps.json          # dominios sin cobertura completa + nota explicativa
└── _build/            # sources.seed.json (editable) + generate.py (reproducible)
```

## Esquema de fuente (`sources.json`)

```json
{
  "id": "inac",
  "name": "INAC — Instituto Nacional de Carnes",
  "institution": "Instituto Nacional de Carnes",
  "type": "primary_official",
  "authority": "very_high",
  "scope": "nacional + internacional (carne)",
  "description": "Faena, precios de hacienda y de exportación, volúmenes y precios por corte y destino, estado de mercados.",
  "coverage": ["faena", "precios-exportacion-carne", "mercados-carne"],
  "domains": ["complejo-carne-bovina", "precios-internacionales-de-commodities", "flujos-de-comercio-exterior", "mercados-destino", "..."],
  "lead_domains": ["complejo-carne-bovina"],
  "activities": ["ganaderia", "frigorifica", "curtiembre", "..."],
  "ramifications": ["carne-bovina", "faena", "oferta-ganado", "..."],
  "markets": ["china", "union-europea", "estados-unidos", "mercosur"],
  "signals": ["precios", "demanda", "oferta", "comercio-exterior"],
  "publication_frequency": "semanal (faena y precios) + mensual (exportaciones)",
  "publication_frequency_code": "weekly",
  "access": { "method": ["web", "excel", "dataset"], "url": "https://www.inac.uy/", "resource_url": null, "endpoint": null,
              "format": ["xlsx", "pdf"], "requires_auth": false, "cost": "free", "automation": "automatable" },
  "quality": { "reliability": "very_high", "freshness": "very_high", "coverage": "very_high",
               "granularity": "very_high", "stability": "high", "machine_readability": "high", "accessibility": "very_high" },
  "priority": "critical",
  "status": "validated",
  "notes": "..."
}
```

- **`domains`** son la relación curada; **`activities`**, **`ramifications`** y **`signals`** se **derivan** cruzando `domains` con `domain-names/_index.json` (solo para dominios sectoriales o de baja fan-out, para no atribuir "todas las actividades" a una fuente transversal; `ramifications` se acota a 60 ids).
- **`markets`**: destinos/bloques concretos que la fuente cubre (dimensión, no dominio) — solo se completa cuando es información específica de la fuente (INAC, INALE, Uruguay XXI, Comtrade, Trade Map, WOAH, DNA, INAVI); vacío en el resto.
- **`lead_domains`**: dominios donde la fuente es *la* referencia (desempata frente a otras primarias).
- **`type`**: `primary_official` · `primary_institutional` · `secondary_trusted` · `tertiary_exceptional`.
- **`authority` / `quality.*` / `priority`**: categorías `very_high` · `high` · `medium` · `low` (sin puntajes numéricos: no hay todavía metodología formal). La **prioridad** pondera relevancia productiva y dependencia del dominio, no solo la autoridad institucional.
- **`access.method`** normalizado: `api` · `web` · `rss` · `download` · `open-data` · `dataset` · `excel` · `pdf` · `manual` · … Solo se afirma `api` cuando se verificó.
- **`access.automation`** (derivado del método): `automatable` (api/open-data/dataset/rss) · `partially_automatable` (download/excel/csv/json/xml) · `manual` (solo web/pdf).
- **`quality.accessibility`** (derivado): penaliza autenticación y costo de pago.
- **`publication_frequency_code`** (derivado de `publication_frequency`): `daily` · `weekly` · `monthly` · `quarterly` · `annual` · `event_driven` · `irregular` · `unknown`.
- **`access.cost`**: `free` · `freemium` · `paid` · `requires_subscription` · `unknown`.
- **`status`**: `validated` · `partial` · `gap`.

## `mappings.json`

Por dominio: `primary` (mejor fuente), `fallback` (otras fuentes primarias equivalentes), `secondary` (respaldo / cobertura parcial) y `coverage`:

| coverage | significado |
|---|---|
| `complete` | ≥1 fuente primaria oficial/institucional de alta autoridad y validada |
| `complete_via_children` | dominio contenedor cubierto por sus subdominios |
| `partial` | solo respaldo/secundaria, autoridad media, o caveat conocido (fuente de pago, proxy, baja frecuencia) |
| `weak` | la única fuente disponible es terciaria o de estado `gap` |
| `missing` | sin ninguna fuente (no ocurre en esta versión) |

`gaps.json` lista todo lo que no es `complete`/`complete_via_children`, con una nota por dominio.

---

## GAP conocido y heredado de `domain-names/`

`barreras-y-requisitos-de-acceso` está enlazado sobre todo a las actividades que ya tienen árbol `mercados-destino` en `ramifications/`. Esta capa **no lo corrige**: sigue cubierto vía `politica-comercial-y-de-acceso-a-mercados` y el dominio sectorial de cada actividad (impacto bajo). Se resolverá cuando se amplíe `mercados-destino` en `ramifications/`. `_index.json` registra este gap en `counts.known_upstream_gap`.

---

## Casos de uso que la capa habilita

- *"Soy productor de ganado bovino"* → `ganaderia-bovina-carne` → 31 dominios → 52 fuentes (INAC, SNIG, DIEA, INUMET, INIA GRAS, BCU, Uruguay XXI, WOAH-WAHIS, …).
- *"Tengo ganadería y soja"* → cruce por `precios-de-granos-y-raciones`, `clima-y-agua`, `insumos-y-costos-de-produccion` (Cámara Mercantil, USDA, FAO/AMIS, INIA GRAS).
- *"Produzco vino y quiero exportar"* → `complejo-vitivinicola` + `mercados-destino` + `barreras-y-requisitos-de-acceso` + `demanda-mundial…` (INAVI, Uruguay XXI, ITC Trade Map, WTO ePing).

---

## Convención de directorios

Siempre `knowledge/domain-names/` (no `domain` / `domains` / `dominio`). Esta capa referencia dominios por `id`, no los copia.

---

## Próximos pasos (`monitoring/`, sin implementar aún)

- Definir **frecuencia de consulta** por dominio/fuente según volatilidad, importancia y costo (distinta de la frecuencia de publicación registrada aquí).
- Priorizar la instrumentación de las fuentes `machine_readability: very_high` con `endpoint`/`api` (BCU WS, catálogo AGESIC CKAN, ADME datos abiertos, World Bank, FAOSTAT, WOAH-WAHIS, EIA).
- Para fuentes solo-web o PDF (OPYPA, consejos de salarios, informes gremiales) prever extracción asistida o carga manual programada.
- Resolver los 10 gaps de `gaps.json` antes de que dependan de ellos señales de alta prioridad (celulosa, fletes, precios de resinas y metales, cadena de frío).
- Modelar el país como **dimensión** al instrumentar `mercados-destino` (una consulta por (fuente × destino), no una fuente por país).
