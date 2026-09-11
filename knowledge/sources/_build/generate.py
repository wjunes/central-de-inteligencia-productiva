"""Genera knowledge/sources/ a partir de sources.seed.json + domain-names/ + ramifications/.

Uso:  python knowledge/sources/_build/generate.py

- sources.seed.json: catalogo curado de fuentes (editar aqui).
- Deriva por fuente las actividades y senales (via domain-names/_index.json).
- Infiere mappings.json (dominio -> fuentes, con rol y cobertura) y gaps.json.
"""
import json, os, collections

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = ROOT + "/knowledge/sources"
SEED = json.load(open(os.path.join(os.path.dirname(__file__), "sources.seed.json"), encoding="utf-8"))
DIDX = json.load(open(ROOT + "/knowledge/domain-names/_index.json", encoding="utf-8"))
DOM = {}
for fn in ("transversal.json", "mercados.json", "sectoriales.json"):
    for d in json.load(open(ROOT + "/knowledge/domain-names/" + fn, encoding="utf-8"))["domains"]:
        DOM[d["id"]] = d
DOMIDS = set(DOM)
ACTIDS = {a["id"] for a in json.load(open(ROOT + "/knowledge/activities/activities.json", encoding="utf-8"))["activities"]}
SIGIDS = {t["id"] for t in json.load(open(ROOT + "/knowledge/ramifications/_signal_types.json", encoding="utf-8"))["signal_types"]}
CHILDREN = collections.defaultdict(list)
for d in DOM.values():
    if d["parent_domain_id"]:
        CHILDREN[d["parent_domain_id"]].append(d["id"])

AUTH_RANK = {"very_high": 3, "high": 2, "medium": 1, "low": 0}
TYPE_RANK = {"primary_official": 4, "primary_institutional": 3, "secondary_trusted": 2, "tertiary_exceptional": 1}
# dominios con caveat conocido: aunque exista fuente, la cobertura es parcial
# (fuente de pago, proxy de menor granularidad, baja frecuencia o sin serie publica estable)
FORCED_PARTIAL = {
 "precios-de-plasticos-y-quimicos", "precios-de-metales-y-siderurgia",
 "fletes-y-logistica-internacional", "mercado-de-carbono-y-sostenibilidad",
 "adopcion-tecnologica-y-digitalizacion", "inteligencia-artificial-y-automatizacion",
 "transporte-carretero", "disponibilidad-de-talento-especializado",
 "costos-de-materiales-de-construccion", "almacenaje-y-cadena-de-frio",
}

sources = SEED["sources"]
errs = []

# ---- validacion de referencias
seen_ids = set()
for s in sources:
    if s["id"] in seen_ids:
        errs.append(f"id duplicado: {s['id']}")
    seen_ids.add(s["id"])
    for dk in ("domains", "domains_secondary"):
        for did in s.get(dk, []):
            if did not in DOMIDS:
                errs.append(f"{s['id']}: dominio inexistente {did}")

# ---- derivacion por fuente: activities + signals (via dominios)
def expand(did):
    out = {did}
    for c in CHILDREN.get(did, []):
        out.add(c)
    return out

FREQ_CODES = [
 (("hora", "diaria", "diario"), "daily"),
 (("semanal",), "weekly"),
 (("mensual",), "monthly"),
 (("trimestral",), "quarterly"),
 (("anual",), "annual"),
 (("continua", "continuo"), "event_driven"),
 (("zafra", "campaña", "campana", "irregular", "bienal"), "irregular"),
]
def freq_code(text):
    t = (text or "").lower()
    for keys, code in FREQ_CODES:
        if any(k in t for k in keys):
            return code
    return "unknown"

AUTOMATABLE_METHODS = {"api", "open-data", "dataset", "rss", "atom"}
PARTIAL_METHODS = {"download", "excel", "csv", "json", "xml"}
MANUAL_METHODS = {"web", "pdf", "manual"}

def automation_of(methods):
    ms = set(methods or [])
    if ms & AUTOMATABLE_METHODS:
        return "automatable"
    if ms & PARTIAL_METHODS:
        return "partially_automatable"
    if ms & MANUAL_METHODS:
        return "manual"
    return "unknown"

def accessibility_of(s):
    acc = s.get("access", {})
    if acc.get("requires_auth") or acc.get("cost") in ("paid", "requires_subscription"):
        return "medium" if acc.get("cost") != "paid" else "low"
    autom = automation_of(acc.get("method"))
    return {"automatable": "very_high", "partially_automatable": "high", "manual": "medium"}.get(autom, "medium")

for s in sources:
    acts, sigs, rams = set(), set(), set()
    alld = set()
    for did in s.get("domains", []) + s.get("domains_secondary", []):
        for d2 in expand(did):
            alld.add(d2)
    for did in alld:
        d = DOM.get(did)
        if not d:
            continue
        # solo se derivan actividades/ramificaciones para dominios sectoriales o de baja fan-out,
        # para no atribuir "todas las actividades" a una fuente transversal
        low_fanout = d["type"] == "sectorial" or (isinstance(d["related_activities"], list) and len(d["related_activities"]) <= 12)
        if low_fanout:
            acts.update(d["related_activities"])
            rams.update(d["related_ramifications"])
        sigs.update(d["related_signals"])
    s["activities"] = sorted(a for a in acts if a in ACTIDS)
    s["ramifications"] = sorted(rams)[:60]
    s["signals"] = sorted(x for x in sigs if x in SIGIDS)
    s.setdefault("markets", [])
    s["access"]["automation"] = automation_of(s["access"].get("method"))
    s["quality"]["accessibility"] = accessibility_of(s)
    s["publication_frequency_code"] = freq_code(s.get("publication_frequency"))

# ---- mappings.json : dominio -> fuentes (rol + cobertura)
dmap = {did: {"primary": [], "fallback": [], "secondary": []} for did in DOMIDS}
for s in sources:
    for did in s.get("domains", []):
        dmap[did]["primary"].append(s["id"])
    for did in s.get("domains_secondary", []):
        dmap[did]["secondary"].append(s["id"])

src_by_id = {s["id"]: s for s in sources}

def score(sid, did=None):
    s = src_by_id[sid]
    lead = 1 if did and did in s.get("lead_domains", []) else 0
    return (lead, TYPE_RANK.get(s["type"], 0), AUTH_RANK.get(s["authority"], 0),
            1 if s.get("status") == "validated" else 0)

def coverage_of(did):
    m = dmap[did]
    prim = sorted(m["primary"], key=lambda sid: score(sid, did), reverse=True)
    # el mejor primario pasa a 'primary', el resto a 'fallback'
    primary = prim[:1]
    fallback = prim[1:] + [x for x in m["fallback"] if x not in prim]
    secondary = m["secondary"]
    best = src_by_id[primary[0]] if primary else None
    if best and best["type"] in ("primary_official", "primary_institutional") \
            and AUTH_RANK.get(best["authority"], 0) >= 2 and best.get("status") == "validated":
        cov = "complete"
    elif best and best.get("status") in ("partial",) or (best and AUTH_RANK.get(best["authority"], 0) <= 1):
        cov = "partial"
    elif best and (best["type"] == "tertiary_exceptional" or best.get("status") in ("gap",)):
        cov = "weak"
    elif primary or secondary:
        cov = "partial"
    else:
        cov = "missing"
    if did in FORCED_PARTIAL and cov == "complete":
        cov = "partial"
    # heredar de hijos si el dominio es contenedor sin fuentes propias
    if cov == "missing" and CHILDREN.get(did):
        child_cov = [coverage_of(c)["coverage"] for c in CHILDREN[did]]
        if any(c == "complete" for c in child_cov):
            cov = "complete_via_children"
        elif any(c in ("partial", "weak") for c in child_cov):
            cov = "partial_via_children"
    return {"domain": did, "type": DOM[did]["type"],
            "primary": primary, "fallback": fallback, "secondary": secondary,
            "coverage": cov}

mappings = {"generated": SEED.get("generated", "2026-09-10"),
            "note": "Rol: 'primary' = mejor fuente para el dominio; 'fallback' = otras primarias equivalentes; 'secondary' = respaldo o cobertura parcial.",
            "domains": [coverage_of(did) for did in sorted(DOMIDS)]}

# ---- gaps.json
GAP_NOTES = {
 "precios-de-plasticos-y-quimicos": "Sin fuente libre de precio de referencia de resinas y petroquímicos. Proxy: Pink Sheet del Banco Mundial (parcial) + reportes de empresas.",
 "precios-de-metales-y-siderurgia": "Precio de acero y metales: LME y worldsteel son de pago o poco granulares en abierto. Proxy: Pink Sheet del Banco Mundial.",
 "precios-internacionales-de-commodities": "Cobertura buena para carne (INAC), lácteos (INALE/GDT), granos (USDA/FAO), petróleo (EIA) y agregados (Pink Sheet). Débil para celulosa (solo servicios de pago FOEX/PIX; proxy en reportes de UPM/Montes del Plata).",
 "fletes-y-logistica-internacional": "Índice FBX de consulta libre; series históricas y detalle por ruta son de pago. Sin fuente automatizable completa.",
 "mercado-de-carbono-y-sostenibilidad": "Precios del mercado voluntario poco transparentes; registros (Verra, Gold Standard) dan volúmenes pero no precio homogéneo.",
 "adopcion-tecnologica-y-digitalizacion": "Sin fuente cuantitativa periódica específica; se infiere de ANII (bienal) y CUTI. Cobertura parcial.",
 "inteligencia-artificial-y-automatizacion": "Sin fuente nacional específica; contexto internacional disperso. Gap estructural, prioridad baja en esta etapa.",
 "costos-de-materiales-de-construccion": "ICC del INE cubre el índice agregado; falta desglose de precios por material. Cámara de la Construcción complementa parcialmente.",
 "transporte-carretero": "MTOP cubre infraestructura y tránsito; los costos operativos del transporte de carga se estiman por gremiales privadas, sin serie pública estable.",
 "disponibilidad-de-talento-especializado": "CUTI e INEFOP dan señales; falta un observatorio de brechas de talento con frecuencia alta.",
 "almacenaje-y-cadena-de-frio": "No hay fuente pública de capacidad instalada de frío y depósitos; se infiere de ANP (portuario) y del régimen de zonas francas.",
}
gaps = {"generated": SEED.get("generated", "2026-09-10"),
        "domains_without_full_coverage": [], "notes_by_domain": GAP_NOTES}
for r in mappings["domains"]:
    if r["coverage"] not in ("complete", "complete_via_children"):
        gaps["domains_without_full_coverage"].append({
            "domain": r["domain"], "type": r["type"], "coverage": r["coverage"],
            "activities_affected": DOM[r["domain"]]["related_activities"] if isinstance(DOM[r["domain"]]["related_activities"], list) and len(DOM[r["domain"]]["related_activities"]) <= 20 else len(DOM[r["domain"]]["related_activities"]),
            "note": GAP_NOTES.get(r["domain"], "Cobertura parcial: revisar fuente primaria o de respaldo.")})

# ---- output
by_type = collections.Counter(s["type"] for s in sources)
by_priority = collections.Counter(s["priority"] for s in sources)
by_automation = collections.Counter(s["access"]["automation"] for s in sources)
cov_dist = collections.Counter(r["coverage"] for r in mappings["domains"])
non_automatable = sorted(s["id"] for s in sources if s["access"]["automation"] == "manual" and s["priority"] in ("critical", "high"))

open(OUT + "/sources.json", "w", encoding="utf-8").write(json.dumps(
    {"generated": SEED.get("generated", "2026-09-10"),
     "sources": [{k: v for k, v in s.items() if not k.startswith("_")} for s in sources]},
    ensure_ascii=False, indent=2) + "\n")
open(OUT + "/mappings.json", "w", encoding="utf-8").write(json.dumps(mappings, ensure_ascii=False, indent=2) + "\n")
open(OUT + "/gaps.json", "w", encoding="utf-8").write(json.dumps(gaps, ensure_ascii=False, indent=2) + "\n")

idx = {"generated": SEED.get("generated", "2026-09-10"),
       "sources_input": ["knowledge/domain-names/", "knowledge/ramifications/", "knowledge/activities/"],
       "counts": {
         "sources_total": len(sources),
         "by_type": dict(by_type),
         "by_priority": dict(by_priority),
         "domains_total": len(DOMIDS),
         "domain_coverage": dict(cov_dist),
         "domains_full_coverage": cov_dist["complete"] + cov_dist["complete_via_children"],
         "domains_with_gap": len(gaps["domains_without_full_coverage"]),
         "critical_sources": sorted(s["id"] for s in sources if s["priority"] == "critical"),
         "by_automation": dict(by_automation),
         "non_automatable_high_priority": non_automatable,
         "known_upstream_gap": {
           "layer": "domain-names", "domain": "barreras-y-requisitos-de-acceso",
           "note": "Enlazado sobre todo a actividades con árbol mercados-destino curado en ramifications/. "
                   "Impacto bajo: las exportadoras restantes quedan cubiertas por politica-comercial-y-de-acceso-a-mercados "
                   "y su dominio sectorial. No corregido aquí; se resolverá al ampliar mercados-destino en ramifications/.",
         },
       },
       "sources": [{"id": s["id"], "name": s["name"], "type": s["type"], "priority": s["priority"],
                    "domains": s.get("domains", []), "status": s.get("status")} for s in sources]}
open(OUT + "/_index.json", "w", encoding="utf-8").write(json.dumps(idx, ensure_ascii=False, indent=2) + "\n")

print("errores:", len(errs))
for e in errs:
    print("  ", e)
print(json.dumps(idx["counts"], ensure_ascii=False, indent=2))
