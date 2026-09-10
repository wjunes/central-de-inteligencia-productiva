# _build

Regenera `knowledge/ramifications/` a partir de `knowledge/activities/activities.json`.

```
python knowledge/ramifications/_build/generate.py
```

- `generate.py`: clasificador (category / relation / direction / relevance), tabla de
  roles entre actividades (supplier, customer, competitor, infrastructure, logistics),
  reglas de riesgos/oportunidades y ensamblado de un archivo por actividad.
- `curated.json`: enriquecimiento manual —
  - `per_activity`: overrides de relevancia, subramificaciones y add.
  - `depth2`: subramificaciones depth 2 en forma compacta `[id, name, category, relation, relevance, direction]`.
  - `value_chain`: eslabones `[stage, target_activity_id|"", name, relevance]`.
  - `market_destinations`: `{ nodo_padre: [[dest_id, nombre, relevancia], ...] }`; cada destino
    recibe los hijos de `market_factor_template` (demanda, precios, requisitos y barreras, competencia).
  - `signals`: `[id, name, relation, relevance]` → `category: strategic_signals`.

Al cambiar `activities.json` o `curated.json`, volver a ejecutar y revisar el diff.
