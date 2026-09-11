# plataformas

Una sola base funcional (`web/`, HTML/CSS/JS moderno, sin framework, sin bundler) reorganizada por tamaño de pantalla — no tres aplicaciones distintas (ver `docs/producto/arquitectura-funcional-ux.md`, sección 8).

```
web/  (base: navegación, temas, accesibilidad, API, componentes)
  ↓
desktop/electron/   (envoltorio Electron sobre la misma base web)
mobile/capacitor/   (envoltorio Capacitor sobre la misma base web)
```

`desktop/` y `mobile/` siguen siendo scaffold vacío — se envuelven sobre `web/` recién cuando esta tenga las pantallas de inteligencia implementadas, nunca antes (no se anticipa esa etapa). Ningún cambio de plataforma debería requerir rehacer navegación, temas, tokens o la capa de API — esa es precisamente la razón de construir primero el AppShell (`web/README.md`) como base común.
