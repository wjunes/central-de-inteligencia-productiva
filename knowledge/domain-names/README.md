# knowledge/domain-names/

## Propósito

`domain-names/` es la capa de **universos de información monitoreables**. Responde:

> ¿Qué ámbitos de información necesitamos observar para comprender, anticipar y explicar cambios que puedan afectar una actividad productiva?

Se construye a partir de `knowledge/activities/` y `knowledge/ramifications/`. **No es** una copia de ninguna de las dos, ni todavía un catálogo de fuentes ni un motor de monitoreo.

```
activities/     ¿qué actividades productivas existen?
ramifications/  ¿qué elementos y relaciones están conectados con cada actividad?
domain-names/   ¿qué universos de información hay que monitorear sobre esos elementos?   ← esta capa
sources/        ¿de dónde se obtiene esa información?
monitoring/     ¿cómo se detecta un cambio?
intelligence/   ¿qué significa ese cambio para cada usuario?
```

---

## Qué es y qué no es un `domain-name`

| Es | No es |
|---|---|
| Un universo de información potencialmente monitoreable y **reutilizable** | Una actividad (`activities/`) o una ramificación (`ramifications/`) |
| `precios-internacionales-de-commodities` | Un indicador: `precio-soja`, `precio-novillo` (capa posterior) |
| `sanidad-animal` | Una fuente: `mgap`, `inia`, `bcu` (una fuente alimenta muchos dominios) |
| `mercados-destino` con el país como **dimensión** | `china`, `brasil`, `alemania` como dominios independientes |
| Información estructurada y señales | `noticias-agropecuarias` (una noticia puede alimentar un dominio, no es el dominio) |
| Estructura permanente | `precios-2026`, `clima-verano-2026` (la fecha pertenece a datos/series) |

Regla rectora: **no se crea un dominio porque un concepto aparezca en una ramificación**, sino cuando su seguimiento puede producir información relevante para una o varias actividades. Se privilegian los dominios transversales; los específicos existen solo cuando un complejo productivo tiene un universo informativo propio.

**Nunca** se crea `dominio × actividad` (`precios-ganaderia`, `precios-agricultura`, …): existe `precios-internacionales-de-commodities` y las relaciones indican qué actividades lo usan.

---

## Estructura

```
domain-names/
├── README.md
├── _index.json          # catálogo plano: id, tipo, jerarquía, recuento de relaciones
├── transversal.json     # dominios transversales, económicos, energéticos, regulatorios, sanitarios, tecnológicos, logísticos, ambientales
├── mercados.json        # dominios de mercado (demanda, precios, mercados-destino, barreras, competencia)
└── sectoriales.json     # dominios por complejo productivo
```

## Esquema de cada dominio

```json
{
  "id": "precios-internacionales-de-commodities",
  "name": "Precios internacionales de commodities",
  "type": "mercado",
  "parent_domain_id": "mercados",
  "description": "Precios de referencia internacionales de los principales productos exportables.",
  "children": [],
  "related_domains": ["demanda-mundial-y-tendencias-de-consumo", "tipo-de-cambio"],
  "related_activities": ["agricultura-secano", "frigorifica", "industria-lactea", "..."],
  "related_ramifications": ["precios-chicago", "precios-internacionales", "tendencia-precio-gdt", "..."],
  "related_signals": ["precios"]
}
```

- **`type`**: `transversal`, `economico`, `regulatorio`, `sanitario`, `tecnologico`, `logistico`, `ambiental` (todos en `transversal.json`), `mercado` (`mercados.json`) o `sectorial` (`sectoriales.json`).
- **`parent_domain_id` / `children`**: jerarquía de máximo 2 niveles (dominio → subdominio).
- **`related_activities` / `related_ramifications` / `related_signals`**: **derivadas**, no escritas a mano. El generador recorre cada ramificación de `ramifications/` y la resuelve a un dominio por token, tipo de señal, actividad destino o categoría. Un dominio padre agrega la cobertura de sus hijos. Esto hace la relación `actividad → ramificación → dominio` trazable.
- `related_ramifications` guarda identificadores de ramificación (no pares actividad:ramificación): es el vocabulario que justifica el dominio.

---

## Mercados-destino: el país como dimensión

El dominio `mercados-destino` lleva `market_dimensions` con los destinos estructurales detectados en `ramifications/` (China, Unión Europea, Estados Unidos, Brasil, Mercosur, Medio Oriente, …). El país/bloque es una **dimensión** del dominio, no un dominio. Así un mismo dominio se reutiliza para distintas actividades y destinos:

```
domain: mercados-destino
dimension: China
información a monitorear (capa posterior): demanda · precios · requisitos · barreras · competencia
```

---

## Subactividades

Una subactividad **no** genera una copia de los dominios de su actividad madre. Sus dominios se resuelven como los de la actividad padre **menos** los correspondientes a ramificaciones que la subactividad excluyó (`ramification_deltas.remove` en `ramifications/`) **más** los de sus ramificaciones propias (`ramification_deltas.add`). El generador ya aplica esta herencia al derivar `related_activities`.

---

## `processes`

Los procesos productivos (cría, faena, riego, molienda…) están en `activities.json` y **no** se representan como dominios. Actúan como **contexto productivo** que ayuda a decidir qué información externa monitorear: el proceso `riego` no es un dominio, pero justifica que `arroz` se relacione con `disponibilidad-de-agua`, `hidrologia-energetica` y `tarifas-y-politica-energetica`.

---

## Cómo se construyó

1. Catálogo de dominios definido en `_build/generate.py` (transversales con jerarquía + un dominio sectorial por complejo productivo + dominios de mercado).
2. `ACT2SEC`: cada actividad se asocia a un dominio sectorial.
3. `TOKENMAP` (≈300 entradas), `CATMAP` (por categoría) y `SIGMAP` (por tipo de señal) resuelven cada ramificación a un dominio; sin coincidencia específica, cae en el dominio sectorial de la actividad.
4. Se recorre `ramifications/` (actividades y deltas de subactividades) y se acumulan `related_activities`, `related_ramifications` y `related_signals`. Los padres agregan a sus hijos.
5. `related_domains` se cura de forma mínima para los cruces más importantes.

Reproducible: `python knowledge/domain-names/_build/generate.py`. Fuentes de referencia: las mismas denominaciones oficiales uruguayas ya usadas en `activities/` y `ramifications/`; no se incorporó investigación estadística, de precios ni de fuentes.

---

## Qué NO contiene

Fuentes, frecuencias de consulta, indicadores, series, umbrales, reglas de alerta, análisis, informes ni recomendaciones. Todo eso corresponde a `sources/`, `monitoring/`, `indicators/` y a las capas de inteligencia.

---

## Convención de directorios

El directorio es **siempre** `knowledge/domain-names/`. Nunca `domain`, `domains`, `dominio` ni `dominios`, tampoco en documentación o referencias arquitectónicas.

---

## Estado

`knowledge/domain-names/` queda **estructuralmente preparado para iniciar la capa de fuentes y monitoreo**: cada actividad se traduce a un conjunto pequeño, coherente y reutilizable de universos de información, con relaciones trazables a actividades, ramificaciones y señales.

## Próximos pasos

- `sources/`: qué organismos, estadísticas, registros y APIs alimentan cada dominio.
- `monitoring/`: qué buscar periódicamente en cada dominio y con qué frecuencia.
- Motor de relevancia: combinar dominios relevantes por perfil de usuario con `relevance` / `direction` de `ramifications/`.
