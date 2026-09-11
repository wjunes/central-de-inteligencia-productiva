# _build

Regenera `knowledge/monitoring/` a partir de `knowledge/sources/` (`sources.json`, `mappings.json`, `gaps.json`) — **solo lectura**, no modifica `sources/` ni capas anteriores.

```
python knowledge/monitoring/_build/generate.py
```

## `generate.py`

- `volatility_of()`: heurística por palabras clave en `description`/`coverage` (+ `VOLATILITY_OVERRIDES` puntuales) → `high` / `medium` / `low` / `event`.
- `FREQ_TABLE`: `(priority, volatility) → frequency`. Es la derivación real de la frecuencia de monitoreo; deliberadamente **no** copia `publication_frequency_code`.
- `cap_for_manual()`: ninguna fuente `automation: manual` queda más seguido que `weekly`.
- `adapter_of()`: elige uno de los 6 adaptadores de `ADAPTERS` según `access.method`/`endpoint`/`format` (más preciso que el campo agregado `access.automation` de `sources/`: por ejemplo, una fuente marcada `automatable` porque expone `dataset` pero sin `endpoint` real cae en `file_download`, no en `api_rest_json`).
- `change_detection_of()`: adaptador + presencia de `markets` → método de detección.
- `MULTI_RESOURCE`: las 10 fuentes con más de un recurso con cadencia propia (cada resource puede fijar su propia `frequency`/`volatility`/`priority`; si no, hereda de la tabla).
- `fallback_of()`: para cada dominio donde la fuente es `primary` en `sources/mappings.json`, arma la lista de `fallback`/`secondary` — no se consulta en paralelo, solo se declara.
- Gaps: cruza `sources/gaps.json` con `domain-names/` para anotar actividades afectadas y con un mapa manual `SIGNAL_IMPACT` (dominio → tipos de `strategic_signals` de `ramifications/_signal_types.json` que dependerían de él).

Al cambiar `sources/`, volver a ejecutar y revisar el diff. `manual-capture-workflow.json` es estático (no depende de `sources/`); editarlo a mano si cambian las etapas del flujo.
