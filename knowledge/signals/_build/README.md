# _build

Regenera `knowledge/signals/` a partir de `knowledge/monitoring/` y `knowledge/sources/` — **solo lectura**, no modifica capas anteriores.

```
python knowledge/signals/_build/generate.py
```

## `generate.py`

- `SIGNAL_TYPES` / `EXCLUDED_AS_TYPES` / `DIMENSIONS`: catálogo curado a mano (5 tipos de naturaleza de cambio, candidatos descartados con su razón, y las dimensiones `direction`/`provenance`/`status`). No se deriva de ningún archivo: es criterio de diseño documentado en `README.md`.
- `rules_doc`: 10 reglas curadas `change_class → outcome` + `deduplication` + `grouping`. Referencian `signal_type` y `change_class` que se validan contra `signal-types.json` y `monitoring/change-detection.json` respectivamente.
- `thresholds_doc`: curado; `overrides` queda vacío a propósito (ver `why_empty`).
- `by_topic` (dentro de `mappings.json`): único elemento realmente **derivado** por join — para cada monitor de `monitoring/monitors.json`, resuelve `source_id` en `sources/sources.json` y toma su campo `signals` (topics, ya calculado en `sources/`, no se recalcula). Se consideró derivar el topic desde `domain-names/*.related_signals` en su lugar (rollup por dominio) pero se descartó: es aún más disperso que `sources.json[].signals` (42 asociaciones sobre 112 dominios vs. ~12 topics distintos usados en `sources.json`), así que se usa `sources.json` como fuente única y se documenta la limitación conocida (`gaps.json.additional_gap_detected`) en vez de reimplementar la heurística de `sources/`.
- `gaps_doc`: toma los 10 dominios de `monitoring/gaps.json` tal cual (no se recalculan), agrega `covering_monitors` (join `domain ∈ sources.json[source_id].domains/domains_secondary` → `monitor.id`) y clasifica `signal_support` según `monitoring_status`.
- Validaciones: ids ASCII/kebab-case sin duplicados en `signal-types.json`; toda `change_class`/`signal_type` referenciada en `rules.json` existe en su catálogo de origen; todo `monitor_id` usado en `mappings.by_topic` existe en `monitoring/monitors.json`; todo `source_id` de cada monitor existe en `sources/sources.json`.

Al cambiar `monitoring/` o `sources/`, volver a ejecutar y revisar el diff. `signal-types.json`, `rules.json` y `thresholds.json` cambian solo si se edita el script (son curados, no derivados de datos externos).
