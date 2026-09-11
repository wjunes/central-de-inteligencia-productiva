# _build

Regenera `knowledge/recommendations/` — **solo lectura** de capas anteriores (`decision/`, `intelligence/`, `relevance/`), no modifica ninguna.

```
python knowledge/recommendations/_build/generate.py
```

## `generate.py`

Todo el contenido es **curado**: no hay instancias de recomendación en el repositorio sobre las que derivar nada más que metodología (mismo caso que `intelligence/` y `decision/`).

Verificaciones contra datos reales:

- `self_loop_check`: recorre `relevance/mappings.json.activity_relevance_graph` para los 3 casos conocidos (Caso 14 del prompt) — sin regresión en esta corrida.
- Consistencia interna: ids únicos y ASCII/kebab-case en `recommendation-types.json`; `criteria.json.strength_ladder` solo referencia `strength`/`recommendation_type` que existen en sus catálogos respectivos.

Al cambiar `decision/` (o transitivamente capas anteriores), volver a ejecutar y revisar el diff.
