# _build

Regenera `knowledge/ramifications/` a partir de `knowledge/activities/activities.json`.

```
python knowledge/ramifications/_build/generate.py
```

- `generate.py`: clasificador + reglas (categoria, relacion, direccion, relevancia) y generador de un archivo por actividad.
- `curated.json`: enriquecimiento manual (subramificaciones depth 2, overrides de relevancia, riesgos/oportunidades) de las actividades de mayor peso.

Al cambiar `activities.json`, volver a ejecutar y revisar el diff.
