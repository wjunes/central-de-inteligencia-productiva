# _build

Regenera `knowledge/ramifications/` a partir de `knowledge/activities/activities.json`.

```
python knowledge/ramifications/_build/generate.py
```

## `generate.py`
- Clasificador `category / relation / direction / relevance` por token y por campo.
- `role()`: tabla de cadenas de procesamiento + sectores → `supplier | customer | competitor | infrastructure | logistics | related_activity`.
- Reglas de `risks` / `opportunities`.
- `SIGNAL_TYPES`: catálogo transversal → se escribe `_signal_types.json`.
- Actividades: archivo completo. Subactividades: se calcula `ramification_deltas` (add/remove/modify) contra el padre; el archivo no repite lo heredado.

## `curated.json`
- `per_activity`: `relevance_overrides`, `children` (por id de ramificación) y `add`.
- `depth2`: subramificaciones compactas `[id, name, category, relation, relevance, direction]`.
- `value_chain`: eslabones `[stage, target_activity_id|"", name, relevance]`.
- `market_destinations`: `{ nodo_padre: [[dest_id, nombre, relevancia], ...] }`; cada destino recibe los hijos de `market_factor_template` (demanda, precios, requisitos y barreras, competencia).
- `signals`: `[id, name, relation, relevance, signal_type]` → `category: strategic_signals` (`signal_type` debe existir en `SIGNAL_TYPES`).
- `subactivity_deltas`: `{ <subactividad>: { remove: [[id, motivo]], modify: [[id, relevance, motivo]] } }` — excepciones a la herencia.

Al cambiar `activities.json` o `curated.json`, volver a ejecutar y revisar el diff.
