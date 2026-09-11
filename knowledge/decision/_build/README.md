# _build

Regenera `knowledge/decision/` — **solo lectura** de capas anteriores (`intelligence/`, `relevance/`), no modifica ninguna.

```
python knowledge/decision/_build/generate.py
```

## `generate.py`

Todo el contenido (`decision-types.json`, `alternatives.json`, `criteria.json`, `constraints.json`, `uncertainty.json`, `evidence.json`, `rules.json`) es **curado**: no hay instancias de decisión en el repositorio sobre las que derivar nada más que metodología (mismo caso que `intelligence/`).

Las únicas verificaciones contra datos reales:

- `self_loop_check`: recorre `relevance/mappings.json.activity_relevance_graph` para los 3 casos conocidos (`agencias-operadores`, `alojamiento`, `cosecha-forestal`) y falla la validación si alguno reapareciera (Caso 15 del prompt) — a diferencia de la tarea de `intelligence/`, esta corrida **no encontró ninguna regresión** y no modificó `relevance/`.
- Consistencia interna: ids únicos y ASCII/kebab-case en `decision-types.json`/`criteria.json`/`constraints.json`.

Al cambiar `intelligence/` o `relevance/`, volver a ejecutar y revisar el diff (principalmente el resultado de `self_loop_check`).
