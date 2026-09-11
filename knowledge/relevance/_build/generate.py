# -*- coding: utf-8 -*-
"""
Regenera knowledge/relevance/ a partir de knowledge/ramifications/ (grafo de
relaciones cruzadas entre actividades ya existente via target_activity_id) y
knowledge/activities/ (jerarquia actividad/subactividad) - solo lectura, no
modifica ninguna capa anterior.

Filosofia (ver README.md):
- levels.json y rules.json son CURADOS (criterio de diseno: como se combinan
  los factores, tabla de decaimiento, propagacion jerarquica, deduplicacion).
- mappings.json es DERIVADO: el grafo actividad-actividad ya existe de forma
  implicita en ramifications/ (cada nodo con target_activity_id). Este script
  solo lo extrae, aplica la tabla de decaimiento curada, propaga por jerarquia
  y deduplica. No inventa ninguna relacion nueva.
- domain_coexposure y market_exposure NO se materializan como tabla (serian
  producto cartesiano actividad x actividad x dominio/mercado - explosion de
  entidades prohibida por el prompt de construccion): quedan como REGLAS en
  rules.json, evaluables en el momento contra domain-names/ y sources.json
  ya existentes.

Ejecutar:
    python knowledge/relevance/_build/generate.py
"""
import json
import os
import glob
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))                  # knowledge/relevance/_build
KNOWLEDGE = os.path.dirname(os.path.dirname(HERE))                  # knowledge
RELEVANCE_DIR = os.path.join(KNOWLEDGE, "relevance")
RAM_DIR = os.path.join(KNOWLEDGE, "ramifications")
GENERATED = "2026-09-11"

LEVEL_ORDER = ["none", "low", "medium", "high", "critical"]


def load(rel_path):
    with open(os.path.join(KNOWLEDGE, rel_path), encoding="utf-8") as f:
        return json.load(f)


def dump(name, obj):
    path = os.path.join(RELEVANCE_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  wrote {name}")


def step_down(level, n=1):
    i = LEVEL_ORDER.index(level)
    return LEVEL_ORDER[max(1, i - n)]  # nunca decae a 'none' por decaimiento: una arista es evidencia de algo


os.makedirs(RELEVANCE_DIR, exist_ok=True)
errors = []

# ---------------------------------------------------------------------------
# 1. Cargar ramifications/ y resolver herencia de subactividades
# ---------------------------------------------------------------------------
ram_files = {}
for f in glob.glob(os.path.join(RAM_DIR, "*.json")):
    base = os.path.basename(f)
    if base in ("_index.json", "_signal_types.json"):
        continue
    aid = base[:-5]
    with open(f, encoding="utf-8") as fh:
        ram_files[aid] = json.load(fh)

_cache = {}


def effective_ramifications(aid):
    """Lista efectiva de nodos top-level de ramificaciones para una actividad
    o subactividad (aplica ramification_deltas si corresponde)."""
    if aid in _cache:
        return _cache[aid]
    d = ram_files[aid]
    if "ramifications" in d:
        result = d["ramifications"]
    else:
        parent = effective_ramifications(d["inherits_from"])
        remove_ids = {(r["id"] if isinstance(r, dict) else r) for r in d["ramification_deltas"].get("remove", [])}
        modify_by_id = {m["id"]: m for m in d["ramification_deltas"].get("modify", [])}
        add_nodes = d["ramification_deltas"].get("add", [])
        result = []
        for node in parent:
            if node["id"] in remove_ids:
                continue
            if node["id"] in modify_by_id:
                merged = dict(node)
                for k, v in modify_by_id[node["id"]].items():
                    if k != "reason":
                        merged[k] = v
                result.append(merged)
            else:
                result.append(node)
        result = result + add_nodes
    _cache[aid] = result
    return result


# ---------------------------------------------------------------------------
# 2. Extraer aristas cruzadas (origin -> target) y el mapa jerarquico
# ---------------------------------------------------------------------------
RelEdge = None  # (origin, ram_id, category, relation, direction, edge_relevance, target)

base_edges = []
self_loops = []
parent_of = {}       # subactividad -> actividad padre
children_of = defaultdict(list)  # actividad -> [subactividades]

for aid, d in ram_files.items():
    if d.get("level") == "subactivity":
        parent_of[aid] = d["parent_activity_id"]
        children_of[d["parent_activity_id"]].append(aid)


def walk(nodes, origin):
    for r in nodes:
        tgt = r.get("target_activity_id")
        if tgt:
            entry = {
                "origin": origin,
                "ram_id": r.get("id"),
                "category": r.get("category"),
                "relation": r.get("relation"),
                "direction": r.get("direction", "direct"),
                "edge_relevance": r.get("relevance"),
                "target": tgt,
            }
            if tgt == origin:
                self_loops.append(entry)
            else:
                base_edges.append(entry)
        walk(r.get("children") or [], origin)


for aid in ram_files:
    walk(effective_ramifications(aid), aid)

# ---------------------------------------------------------------------------
# 3. Tabla de decaimiento (curada) y clasificacion de relaciones
# ---------------------------------------------------------------------------
STRONG_RELATIONS = {"supplier", "customer", "infrastructure", "competitor"}
WEAK_RELATIONS = {"related_activity", "complement"}

DECAY = {
    ("strong", "critical"): "high",
    ("strong", "high"): "medium",
    ("strong", "medium"): "low",
    ("strong", "low"): "low",
    ("weak", "critical"): "medium",
    ("weak", "high"): "low",
    ("weak", "medium"): "low",
    ("weak", "low"): "low",
}


def tier_of(relation):
    if relation in STRONG_RELATIONS:
        return "strong"
    if relation in WEAK_RELATIONS:
        return "weak"
    return None


def decayed_level(edge):
    tier = tier_of(edge["relation"])
    if tier is None:
        errors.append(f"relacion sin tier definido: {edge['relation']} (edge {edge['origin']}->{edge['target']})")
        return "low"
    base = DECAY.get((tier, edge["edge_relevance"]), "low")
    if edge["direction"] == "indirect":
        base = step_down(base, 1)
    return base


# ---------------------------------------------------------------------------
# 4. Propagacion jerarquica (actividad padre <-> subactividades)
# ---------------------------------------------------------------------------
propagated_edges = []
existing_pairs = {(e["origin"], e["target"]) for e in base_edges}

for e in base_edges:
    # el target tiene subactividades: propagar a cada una si no tienen edge propio mas especifico
    for child in children_of.get(e["target"], []):
        if child == e["origin"]:
            continue  # evita sintetizar un self-loop cuando el child coincide con el otro extremo
        if (e["origin"], child) not in existing_pairs:
            pe = dict(e)
            pe["target"] = child
            pe["propagated_via"] = f"jerarquia: {e['target']} es actividad padre de {child}"
            propagated_edges.append(pe)
    # el origin tiene subactividades: propagar desde cada una si no tienen edge propio mas especifico
    for child in children_of.get(e["origin"], []):
        if child == e["target"]:
            continue  # evita sintetizar un self-loop cuando el child coincide con el otro extremo
        if (child, e["target"]) not in existing_pairs:
            pe = dict(e)
            pe["origin"] = child
            pe["propagated_via"] = f"jerarquia: {e['origin']} es actividad padre de {child}"
            propagated_edges.append(pe)

all_edges = base_edges + propagated_edges

# ---------------------------------------------------------------------------
# 5. Deduplicacion: una entrada por (origin, target), nivel = maximo, evidencia = todas las aristas
# ---------------------------------------------------------------------------
by_pair = defaultdict(list)
for e in all_edges:
    e["derived_level"] = decayed_level(e)
    by_pair[(e["origin"], e["target"])].append(e)

activity_relevance_graph = defaultdict(list)
for (origin, target), evs in by_pair.items():
    best_level = max(evs, key=lambda x: LEVEL_ORDER.index(x["derived_level"]))["derived_level"]
    evidence = [
        {
            "ramification_id": ev["ram_id"],
            "category": ev["category"],
            "relation": ev["relation"],
            "direction": ev["direction"],
            "edge_relevance": ev["edge_relevance"],
            "propagated_via": ev.get("propagated_via"),
        }
        for ev in evs
    ]
    reason = f"{target} es {evs[0]['relation']} de {origin}" if not evs[0].get("propagated_via") else \
             f"{target} es {evs[0]['relation']} de {origin} (heredado por {evs[0]['propagated_via']})"
    activity_relevance_graph[origin].append({
        "target_activity_id": target,
        "relevance_level": best_level,
        "reason": reason,
        "evidence": evidence,
    })

for origin in activity_relevance_graph:
    activity_relevance_graph[origin].sort(key=lambda x: (-LEVEL_ORDER.index(x["relevance_level"]), x["target_activity_id"]))

# ---------------------------------------------------------------------------
# 6. Actividades aisladas (sin ninguna arista, ni como origen ni como destino)
# ---------------------------------------------------------------------------
all_ids = set(ram_files.keys())
connected = set()
for (o, t) in by_pair:
    connected.add(o)
    connected.add(t)
isolated = sorted(all_ids - connected)

mappings_doc = {
    "generated": GENERATED,
    "principle": "No duplica ramifications/: extrae el grafo actividad-actividad ya implicito en sus nodos con target_activity_id, aplica la tabla de decaimiento de rules.json y propaga por jerarquia actividad/subactividad. domain_coexposure y market_exposure NO se materializan aqui (ver rules.json) para evitar explosion combinatoria.",
    "source": "knowledge/ramifications/*.json (campo target_activity_id de cada nodo, mas herencia via ramification_deltas)",
    "activity_relevance_graph": {k: v for k, v in sorted(activity_relevance_graph.items())},
    "isolated_activities": isolated,
}

# ---------------------------------------------------------------------------
# 7. levels.json (curado)
# ---------------------------------------------------------------------------
levels_doc = {
    "generated": GENERATED,
    "levels": [
        {
            "id": "critical",
            "name": "Crítica",
            "meaning": "La señal afecta directamente un elemento central de la actividad (su propia ramificación de origen, con relevancia crítica declarada en ramifications/).",
            "criteria": "target_activity_id == actividad de origen de la señal, y la ramificación de origen tiene relevance=critical (ver rules.json: direct_dependency).",
            "expected_behavior": "Debe considerarse candidata prioritaria en toda evaluación posterior (relevance/ no decide notificar; solo clasifica).",
        },
        {
            "id": "high",
            "name": "Alta",
            "meaning": "Vínculo estructural fuerte (proveedor, cliente, infraestructura o competidor directo) con la actividad de origen, o la actividad de origen misma con relevancia alta declarada.",
            "criteria": "relation en {supplier, customer, infrastructure, competitor} y edge_relevance=critical (decae un escalón), o edge_relevance=high sin decaimiento adicional; o direct_dependency con relevance=high.",
            "expected_behavior": "Normalmente debe evaluarse en la siguiente capa.",
        },
        {
            "id": "medium",
            "name": "Media",
            "meaning": "Vínculo estructural moderado, o un vínculo fuerte propagado con un escalón de decaimiento, o una relación de cadena de valor/actividad relacionada (related_activity) de peso alto.",
            "criteria": "Ver rules.json.decay_table.",
            "expected_behavior": "Se evalúa junto con otras señales del mismo período/dominio; no se descarta pero tampoco se prioriza sola.",
        },
        {
            "id": "low",
            "name": "Baja",
            "meaning": "Vínculo débil: relación genérica (related_activity/complement) muy decaída, o coexposición por dominio compartido sin vínculo estructural directo.",
            "criteria": "Ver rules.json.decay_table y rules.json.factors.domain_coexposure.",
            "expected_behavior": "Disponible bajo demanda; no se propone proactivamente (reduce ruido, mismo principio que signals/).",
        },
        {
            "id": "none",
            "name": "Ninguna",
            "meaning": "No existe evidencia estructural de relación entre la señal (su origen) y la actividad candidata.",
            "criteria": "No hay arista en activity_relevance_graph, no hay dominio compartido, no hay exposición de mercado común.",
            "expected_behavior": "No se evalúa más. Debe poder expresarse explícitamente (no ausencia por omisión) - ver Caso 5/10 en README.md.",
        },
    ],
}

# ---------------------------------------------------------------------------
# 8. rules.json (curado)
# ---------------------------------------------------------------------------
rules_doc = {
    "generated": GENERATED,
    "principle": "La relevancia se determina combinando un pequeño conjunto de factores estructurales, nunca evaluando la señal contra todas las actividades (signal -> dominio -> actividades relacionadas, no signal -> todas las actividades).",
    "factors": [
        {
            "id": "direct_dependency",
            "description": "La actividad candidata ES la actividad de origen de la señal (la ramificación que generó la señal pertenece a esa actividad).",
            "level_source": "El campo relevance de la ramificación de origen, sin decaimiento (critical/high/medium tal cual está en ramifications/).",
            "materialized_in": "No materializado en mappings.json (depende de la ramificación concreta de cada señal, no de un par de actividades fijo). Se evalúa en el momento contra ramifications/<activity_id>.json.",
        },
        {
            "id": "value_chain_relation",
            "description": "La actividad candidata está conectada a la actividad de origen mediante una arista estructural directa de ramifications/ (target_activity_id): proveedor, cliente, infraestructura, competidor, o actividad relacionada/complementaria dentro de la cadena de valor.",
            "level_source": "decay_table, aplicada por relation y por edge_relevance de origen; un escalón adicional de decaimiento si direction=indirect.",
            "materialized_in": "mappings.json.activity_relevance_graph (incluye propagación jerárquica actividad-padre/subactividad).",
            "subsumes": "input_dependency, output_dependency, indirect_dependency, technology_dependency (cuando la tecnología es en sí una actividad relacionada) — se descartaron como factores separados para no proliferar: todos son subtipos de este mismo vínculo estructural, ya distinguibles por el campo relation.",
        },
        {
            "id": "domain_coexposure",
            "description": "La actividad candidata no tiene arista estructural directa (ni propagada) con la actividad de origen, pero ambas aparecen en related_activities de un mismo dominio de domain-names/.",
            "level_source": "Nivel fijo 'low' (relación existente pero sin evidencia de mecanismo estructural concreto).",
            "materialized_in": "No materializado (el producto actividad x actividad x dominio es combinatoriamente grande - algunos dominios transversales superan 90 actividades relacionadas). Se evalúa en el momento: ¿origin_activity y target_activity aparecen ambas en domain-names/*.json[domain_id].related_activities para algún domain_id de la señal?",
        },
        {
            "id": "market_exposure",
            "description": "La señal está asociada a un mercado/destino concreto (vía scope.parameters del monitor de origen, ver signals/mappings.json) y la actividad candidata tiene exposición documentada a ese mismo mercado.",
            "level_source": "Modificador condicional: si el topic_id de la señal está en {comercio-exterior, acceso-a-mercados, precios, demanda} y origin/target comparten mercado, se sube un escalón el nivel ya calculado por los otros factores (tope 'high'); si no hay ningún otro factor aplicable, nivel base 'medium'.",
            "materialized_in": "No materializado. La exposición a mercado hoy solo existe a nivel de fuente (sources.json[].markets, ~10 fuentes) y de dominio (domain-names/mercados.json#mercados-destino.market_dimensions), no a nivel actividad-mercado individual — ver gaps.json.",
            "condition": "Aplica solo cuando la actividad candidata figura en sources.json[].activities de alguna fuente que también declara ese market en sources.json[].markets, o comparte el dominio mercados-destino.",
        },
    ],
    "excluded_as_separate_factors": [
        {"candidate": "cost_exposure", "reason": "Es value_chain_relation (relation=supplier/input) condicionado al topic_id=costos de la señal; el topic ya viene de signals/, no se duplica aquí como factor propio."},
        {"candidate": "risk_exposure / opportunity_exposure", "reason": "Calificar algo como riesgo u oportunidad para una actividad requiere evaluación de contexto — corresponde a intelligence/, no a relevance/ (ver README §21-22)."},
        {"candidate": "regulatory_exposure / climate_exposure / sanitary_exposure / logistics_exposure / financial_exposure", "reason": "Son value_chain_relation o domain_coexposure condicionados a un topic_id específico (regulacion, clima-agua, sanidad, infraestructura-logistica, financiamiento respectivamente, ya catalogados en ramifications/_signal_types.json). No requieren mecánica de cálculo propia."},
        {"candidate": "demand_exposure", "reason": "Subtipo de value_chain_relation (relation=customer) o de domain_coexposure; el topic_id=demanda/consumo ya lo distingue."},
    ],
    "decay_table": {
        "note": "tier(relation) x edge_relevance -> nivel propagado. Un escalón adicional de decaimiento si la arista es direction=indirect. Ninguna arista existente decae hasta 'none' (una arista es siempre evidencia de al menos 'low').",
        "strong_relations": sorted(STRONG_RELATIONS),
        "weak_relations": sorted(WEAK_RELATIONS),
        "table": {f"{tier}/{rel}": lvl for (tier, rel), lvl in DECAY.items()},
    },
    "hierarchy_propagation": {
        "rule": "Si una arista estructural tiene como origen o como destino una actividad que posee subactividades (ramifications/<id>.json con level=subactivity y parent_activity_id=esa actividad), la misma arista se propaga a cada subactividad sin decaimiento adicional, salvo que la subactividad ya tenga su propia arista específica hacia/desde ese mismo destino/origen (en cuyo caso prevalece la arista específica, más precisa).",
        "rationale": "La actividad general (p. ej. 'ganadería') es un agregado de sus subactividades; una relación estructural declarada a ese nivel es, por defecto, heredable — igual que ramifications/ hereda ramificaciones de padre a subactividad (inherits_from). No es un factor nuevo, es la misma semántica de herencia ya definida, aplicada a aristas entrantes/salientes.",
        "example": "cultivo-soja -> ganaderia (related_activity, high) se propaga a cultivo-soja -> ganaderia-bovina-carne, cultivo-soja -> ganaderia-ovina, cultivo-soja -> ganaderia-porcina (ver README §Caso ganadería+soja).",
    },
    "center_of_gravity": {
        "rule": "La actividad principal de un perfil productivo NO recibe automáticamente relevancia máxima. relevance/ calcula el nivel estructural igual para actividad principal y secundarias; el único efecto de 'centro de gravedad' es una etiqueta is_primary_activity=true en el resultado por perfil, que las capas posteriores (relevance no) pueden usar para ponderar al agregar múltiples señales simultáneas.",
        "prohibited": "Elevar artificialmente el nivel de una actividad solo por ser la principal del perfil (ver prompt §14).",
    },
    "deduplication": {
        "rule": "Una única entrada por par (origin_activity, target_activity): si existen varias aristas/razones, se conserva el nivel MÁXIMO entre ellas y se listan todas como evidence[], en vez de crear una relación por cada arista.",
        "applies_to": "mappings.json.activity_relevance_graph",
    },
    "profile_relevance": {
        "definition": "productive_profile = {main_activity_id, secondary_activity_ids: []}. profile_relevance(signal, profile) = { activity_id: structural_relevance(signal, activity_id), is_primary_activity: activity_id == profile.main_activity_id } para cada actividad en {main_activity_id} unión secondary_activity_ids.",
        "note": "No se instancian perfiles reales en esta capa (no existen perfiles productivos en el repositorio todavía). Se define el mecanismo; knowledge/relevance/README.md incluye un ejemplo resuelto contra datos reales (ganadería bovina + soja).",
    },
}

# ---------------------------------------------------------------------------
# 9. gaps.json (derivado + documentado)
# ---------------------------------------------------------------------------
gaps_doc = {
    "generated": GENERATED,
    "principle": "No se asigna relevancia artificial cuando falta evidencia estructural suficiente (prompt §37, Caso 10).",
    "isolated_activities": {
        "count": len(isolated),
        "ids": isolated,
        "meaning": "Actividades sin ninguna arista cruzada (ni como origen ni como destino) en ramifications/. Una señal originada en ellas solo puede evaluarse con direct_dependency (sobre sí mismas) y domain_coexposure (vía dominios compartidos); no hay propagación estructural a otras actividades.",
        "corregido_en_esta_tarea": False,
    },
    "self_loop_anomaly": {
        "count": len(self_loops),
        "entries": [{"activity": e["origin"], "ramification_id": e["ram_id"], "category": e["category"]} for e in self_loops],
        "gap": "GAP DETECTADO",
        "capa": "ramifications/ (heredado, capa cerrada)",
        "elemento": "3 nodos de value_chain con target_activity_id igual a su propia actividad de origen (agencias-operadores, alojamiento, cosecha-forestal).",
        "motivo": "Etapa de la propia cadena de valor etiquetada con target_activity_id apuntando a la misma actividad, en vez de omitir el campo (como en el resto de los nodos value_chain de etapa propia).",
        "impacto": "Ninguno sobre relevance/: estos 3 casos se excluyen explícitamente del grafo (un origin==target no aporta relevancia hacia una OTRA actividad).",
        "correccion_propuesta": "Quitar target_activity_id de esos 3 nodos en una futura revisión de ramifications/ (no se modifica aquí).",
        "corregido_en_esta_tarea": False,
    },
    "propagation_self_loop_bug": {
        "gap": "GAP DETECTADO Y CORREGIDO",
        "capa": "relevance/ (esta capa, detectado durante la construcción de intelligence/)",
        "elemento": "Propagación jerárquica en _build/generate.py (paso 4).",
        "motivo": (
            "Los 3 self-loops de ramifications/ (ver self_loop_anomaly) quedaban excluidos de base_edges tal como "
            "los declara la propia subactividad, pero la MISMA relación existe, sin ser un self-loop, un nivel más "
            "arriba (p. ej. turismo -> alojamiento, category=value_chain, no es un self-loop). La propagación "
            "jerárquica ('si origin tiene subactividades, propagar a cada hijo') no comprobaba que el hijo propagado "
            "coincidiera con el otro extremo de la arista, y sintetizaba turismo->alojamiento como alojamiento->alojamiento "
            "(un self-loop nuevo, no presente en ramifications/)."
        ),
        "impacto": "3 pares espurios (alojamiento, agencias-operadores, cosecha-forestal, cada uno apuntando a sí mismo) en activity_relevance_graph, detectados por la validación de intelligence/_build/generate.py al construir esa capa sobre este grafo.",
        "correccion_aplicada": "Se agregó un guard en la propagación (child == el otro extremo de la arista -> se omite) en _build/generate.py. Corrección mínima e indispensable: sin ella, intelligence/ no podía excluir correctamente estos casos de sus relaciones transitivas (prompt de intelligence/, §54).",
        "corregido_en_esta_tarea": True,
    },
    "market_exposure_granularity": {
        "gap": "GAP DETECTADO",
        "capa": "sources/ y domain-names/ (heredado)",
        "elemento": "Exposición a mercado por actividad individual.",
        "motivo": "sources.json[].markets existe a nivel de FUENTE (~10 de 77), y domain-names/mercados.json#mercados-destino.market_dimensions existe a nivel de DOMINIO; no existe un campo 'actividad expuesta a mercado X' a nivel de ramifications/ o activities/.",
        "impacto": "La regla market_exposure de rules.json solo puede aplicarse de forma aproximada (vía la lista sources.json[source].activities de una fuente con markets), no de forma precisa por actividad.",
        "correccion_propuesta": "Si se necesita precisión, agregar una exposición de mercado explícita en una futura revisión de ramifications/ o activities/ (no se modifica aquí).",
        "corregido_en_esta_tarea": False,
    },
    "relations_without_target_ramification": {
        "gap": "GAP DETECTADO",
        "capa": "ramifications/ (heredado, capa cerrada)",
        "elemento": "target_activity_id sin target_ramification_id equivalente.",
        "motivo": "Cada arista conoce la ramificación de ORIGEN exacta (ram_id) pero solo la ACTIVIDAD de destino, no una ramificación de destino específica (prompt §12 pedía permitir actividad+ramificación+relevancia 'cuando exista evidencia estructural suficiente' - existe solo del lado origen).",
        "impacto": "La relevancia a nivel de ramificación (no solo actividad) solo puede calcularse para la actividad de ORIGEN de la señal (via direct_dependency), no para las actividades relacionadas.",
        "correccion_propuesta": "No aplica corrección: es una limitación real de granularidad de datos, no un error. Documentada para que intelligence/ no asuma una precisión que no existe.",
        "corregido_en_esta_tarea": False,
    },
    "known_upstream_gaps_carried_forward": {
        "domain_names": "barreras-y-requisitos-de-acceso (ver sources/README.md) - no corregido aquí",
        "sources_signals_topic_coverage": "7/19 topics del catálogo sin fuente/dominio asociado (ver signals/gaps.json.additional_gap_detected) - no corregido aquí",
    },
}

# ---------------------------------------------------------------------------
# 10. Validaciones
# ---------------------------------------------------------------------------
known_activity_ids = set(ram_files.keys())
for origin, entries in activity_relevance_graph.items():
    if origin not in known_activity_ids:
        errors.append(f"origin desconocido en activity_relevance_graph: {origin}")
    for e in entries:
        if e["target_activity_id"] not in known_activity_ids:
            errors.append(f"target desconocido: {e['target_activity_id']} (origin {origin})")
        if e["relevance_level"] not in LEVEL_ORDER:
            errors.append(f"nivel invalido: {e['relevance_level']}")

level_ids = {l["id"] for l in levels_doc["levels"]}
if level_ids != set(LEVEL_ORDER):
    errors.append(f"levels.json no coincide con LEVEL_ORDER: {level_ids} vs {set(LEVEL_ORDER)}")

# ---------------------------------------------------------------------------
# 11. _index.json
# ---------------------------------------------------------------------------
pairs_total = sum(len(v) for v in activity_relevance_graph.values())
by_level = defaultdict(int)
for entries in activity_relevance_graph.values():
    for e in entries:
        by_level[e["relevance_level"]] += 1

index_doc = {
    "generated": GENERATED,
    "inputs": [
        "knowledge/ramifications/*.json",
    ],
    "counts": {
        "activities_total": len(ram_files),
        "base_edges": len(base_edges),
        "propagated_edges": len(propagated_edges),
        "self_loops_excluded": len(self_loops),
        "activity_pairs_with_relevance": pairs_total,
        "activity_pairs_by_level": dict(sorted(by_level.items())),
        "origin_activities_with_outbound_relevance": len(activity_relevance_graph),
        "isolated_activities": len(isolated),
        "levels_total": len(levels_doc["levels"]),
        "rule_factors_total": len(rules_doc["factors"]),
        "excluded_factors": len(rules_doc["excluded_as_separate_factors"]),
    },
    "known_upstream_gaps": gaps_doc["known_upstream_gaps_carried_forward"],
    "validation_errors": errors,
}

# ---------------------------------------------------------------------------
# 12. Escritura
# ---------------------------------------------------------------------------
if errors:
    print("ERRORES DE VALIDACION:")
    for e in errors:
        print("  -", e)
else:
    print("Validacion OK (0 errores).")

dump("levels.json", levels_doc)
dump("rules.json", rules_doc)
dump("mappings.json", mappings_doc)
dump("gaps.json", gaps_doc)
dump("_index.json", index_doc)

print("\nrelevance/ regenerado.")
