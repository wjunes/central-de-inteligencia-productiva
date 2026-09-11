"""Genera knowledge/monitoring/ a partir de knowledge/sources/ (solo lectura).

Uso:  python knowledge/monitoring/_build/generate.py

No modifica activities/ ramifications/ domain-names/ sources/. Deriva, por cada
fuente (y sus recursos cuando corresponde), un monitor: adaptador de acceso,
frecuencia de monitoreo (no confundida con la de publicacion), metodo de
deteccion de cambios, parametrizacion (p.ej. mercado-destino) y fallback.
"""
import json, os, re, collections

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = ROOT + "/knowledge/monitoring"
SRC = json.load(open(ROOT + "/knowledge/sources/sources.json", encoding="utf-8"))["sources"]
MAP = json.load(open(ROOT + "/knowledge/sources/mappings.json", encoding="utf-8"))["domains"]
GAPS = json.load(open(ROOT + "/knowledge/sources/gaps.json", encoding="utf-8"))
SBYID = {s["id"]: s for s in SRC}
GEN_DATE = "2026-09-11"

# ===================================================================== 1. VOCABULARIO
FREQUENCIES = ["realtime", "hourly", "every_3_hours", "every_6_hours", "daily",
               "weekly", "monthly", "quarterly", "annual", "event_driven", "manual"]
FREQ_ORDER = {f: i for i, f in enumerate(FREQUENCIES)}  # mayor indice = mas frecuente, salvo event_driven/manual (fuera de escala)
STEP_UP = {"annual": "quarterly", "quarterly": "monthly", "monthly": "weekly",
           "weekly": "daily", "daily": "every_6_hours", "every_6_hours": "hourly", "hourly": "realtime"}

VOLATILITIES = ["high", "medium", "low", "event"]

# ===================================================================== 2. VOLATILIDAD (heuristica + excepciones)
HIGH_VOL_KEYWORDS = ["precio", "cotiza", "tarifa", "tipo de cambio", "despacho", "spot",
                     "clima", "meteorol", "pronostico", "hidrolog", "faena", "mercado eléctrico",
                     "tránsito", "transito", "movimiento portuario"]
LOW_VOL_KEYWORDS = ["anuario", "censo", "encuesta anual", "memoria", "cartograf", "padrón",
                     "padron", "registro de cultivares", "propiedad de cultivares"]
EVENT_KEYWORDS = ["notificaci", "brote", "foco", "diario oficial", "alerta", "diferencia comercial",
                   "eping", "consejos de salarios", "laudo"]

VOLATILITY_OVERRIDES = {
    "adme": "high", "inumet": "high", "bcu": "high", "ancap": "high", "ursea": "high",
    "camara-mercantil": "high", "bolsa-cereales-mvd": "high", "sul": "high",
    "inia-gras": "high", "mercado-modelo-uam": "high", "dinagua": "high",
    "eia-iea": "high", "usda-fas": "high", "noaa-iri-enso": "medium",
    "mgap-dgsg": "event", "mgap-dgssaa": "event", "woah-wahis": "event",
    "ippc": "event", "impo": "event", "wto": "event", "mtss": "event",
    "fao-faostat": "low", "oecd-fao-outlook": "low", "anii": "low", "inefop": "low",
    "cuti": "low", "miem-dinamige": "low", "udelar-iecon": "low",
}

def volatility_of(s):
    if s["id"] in VOLATILITY_OVERRIDES:
        return VOLATILITY_OVERRIDES[s["id"]]
    text = (s.get("description", "") + " " + " ".join(s.get("coverage", []))).lower()
    if any(k in text for k in EVENT_KEYWORDS):
        return "event"
    if any(k in text for k in LOW_VOL_KEYWORDS):
        return "low"
    if any(k in text for k in HIGH_VOL_KEYWORDS):
        return "high"
    return "medium"

# ===================================================================== 3. FRECUENCIA DE MONITOREO
# tabla base por (prioridad, volatilidad) -- NO es igual a publication_frequency_code
FREQ_TABLE = {
    ("critical", "high"): "daily", ("critical", "medium"): "weekly", ("critical", "low"): "quarterly",
    ("high", "high"): "daily", ("high", "medium"): "weekly", ("high", "low"): "monthly",
    ("medium", "high"): "weekly", ("medium", "medium"): "monthly", ("medium", "low"): "quarterly",
    ("low", "high"): "monthly", ("low", "medium"): "quarterly", ("low", "low"): "annual",
}
FREQ_OVERRIDES = {  # excepciones puntuales donde la tabla generica no es proporcional
    "adme": "every_6_hours",  # datos horarios, pero sondeo cada 6h es suficiente y mas eficiente
    "inumet": "daily",
    "bcu": "daily",           # se ajusta por recurso mas abajo (cotizaciones vs cuentas nacionales)
    "impo": "event_driven",
}

def base_frequency(priority, volatility):
    if volatility == "event":
        return "event_driven"
    return FREQ_TABLE.get((priority, volatility), "monthly")

def cap_for_manual(freq):
    # una fuente manual no debe programarse mas seguido que semanal: requiere intervencion humana
    order = ["annual", "quarterly", "monthly", "weekly"]
    if freq in ("daily", "every_6_hours", "hourly", "realtime"):
        return "weekly"
    return freq

# ===================================================================== 4. ADAPTADORES (reutilizables)
ADAPTERS = {
    "api_rest_json": {"name": "API REST (JSON)", "protocol": "http", "formats": ["json"],
        "retry": {"max_retries": 3, "backoff": "exponential", "base_delay_s": 5},
        "cache": {"ttl_relative_to_frequency": True}},
    "api_soap": {"name": "API SOAP/XML", "protocol": "http", "formats": ["xml", "soap"],
        "retry": {"max_retries": 3, "backoff": "exponential", "base_delay_s": 5},
        "cache": {"ttl_relative_to_frequency": True}},
    "ckan_api": {"name": "Catálogo CKAN (API de datasets)", "protocol": "http", "formats": ["json", "csv"],
        "retry": {"max_retries": 3, "backoff": "exponential", "base_delay_s": 10},
        "cache": {"ttl_relative_to_frequency": True}},
    "feed": {"name": "Feed RSS/Atom", "protocol": "http", "formats": ["rss", "atom"],
        "retry": {"max_retries": 2, "backoff": "fixed", "base_delay_s": 30},
        "cache": {"ttl_relative_to_frequency": False}},
    "file_download": {"name": "Descarga de archivo estructurado", "protocol": "http", "formats": ["xlsx", "csv", "xml"],
        "retry": {"max_retries": 3, "backoff": "exponential", "base_delay_s": 15},
        "cache": {"ttl_relative_to_frequency": True}},
    "web_scrape": {"name": "Lectura estructurada de página web", "protocol": "http", "formats": ["html"],
        "retry": {"max_retries": 2, "backoff": "exponential", "base_delay_s": 15},
        "cache": {"ttl_relative_to_frequency": True},
        "notes": "Requiere mantenimiento de selectores; usar solo cuando no exista dataset ni descarga."},
    "manual_capture": {"name": "Captura asistida (documento o página no estructurada)", "protocol": "human",
        "formats": ["pdf", "html"],
        "retry": {"max_retries": 0, "backoff": "none", "base_delay_s": 0},
        "cache": {"ttl_relative_to_frequency": False},
        "notes": "Ver manual-capture-workflow.json."},
}

def adapter_of(s):
    acc = s["access"]; methods = set(acc.get("method") or [])
    endpoint = (acc.get("endpoint") or "")
    if "wsdl" in endpoint.lower() or "soap" in endpoint.lower():
        return "api_soap"
    if "api" in methods and endpoint:
        return "api_rest_json"
    if "open-data" in methods and ("ckan" in endpoint.lower() or "catalogodatos" in (acc.get("resource_url") or acc.get("url") or "").lower()):
        return "ckan_api"
    if "api" in methods:
        return "api_rest_json"
    if "rss" in methods or "atom" in methods:
        return "feed"
    formats = set(acc.get("format") or [])
    if ("download" in methods or "dataset" in methods or "excel" in methods) and (formats & {"xlsx", "csv", "xml", "shp"}):
        return "file_download"
    if methods == {"web"} or methods == {"web", "pdf"} or methods == {"pdf"} or acc.get("automation") == "manual":
        return "manual_capture"
    if "web" in methods and not (formats & {"xlsx", "csv", "json", "xml"}):
        return "manual_capture"
    return "file_download"

# ===================================================================== 5. DETECCION DE CAMBIOS
CD_CATALOG = {
    "value_comparison": {"name": "Comparación de valor", "use": "Series numéricas / indicadores puntuales (cotización, tasa, índice).",
        "emits": ["sin_cambio", "valor_modificado", "fuente_no_disponible", "error_de_adquisicion"]},
    "record_diff": {"name": "Comparación de registros", "use": "Datasets tabulares (altas, bajas, modificaciones por clave).",
        "emits": ["sin_cambio", "nuevo_registro", "registro_eliminado", "valor_modificado", "error_de_adquisicion"]},
    "structural_diff": {"name": "Comparación estructural", "use": "JSON/XML anidado o con esquema propio.",
        "emits": ["sin_cambio", "cambio_de_contenido", "estructura_modificada", "error_de_adquisicion"]},
    "new_item_detection": {"name": "Detección de nuevo ítem", "use": "Feeds, catálogos CKAN, boletines: aparición de un nuevo recurso o entrada.",
        "emits": ["sin_cambio", "nuevo_registro", "fuente_no_disponible"]},
    "hash_comparison": {"name": "Comparación por hash", "use": "Documentos o páginas sin estructura de registros (PDF, HTML de referencia).",
        "emits": ["sin_cambio", "cambio_de_contenido", "fuente_no_disponible"]},
    "new_document_detection": {"name": "Detección de nuevo documento", "use": "Publicaciones periódicas en PDF (anuarios, informes).",
        "emits": ["sin_cambio", "nuevo_registro", "error_de_adquisicion"]},
}

def change_detection_of(adapter, s):
    if adapter == "api_soap":
        return "value_comparison"
    if adapter == "ckan_api":
        return "new_item_detection"
    if adapter == "feed":
        return "new_item_detection"
    if adapter == "manual_capture":
        return "new_document_detection" if "pdf" in (s["access"].get("format") or []) else "hash_comparison"
    if adapter == "file_download":
        # datasets con muchos registros por destino/producto -> record_diff; series/indicadores -> value_comparison
        many_records = bool(set(s.get("markets", [])) - set()) or "dataset" in (s["access"].get("method") or [])
        return "record_diff" if many_records else "value_comparison"
    if adapter == "api_rest_json":
        return "record_diff" if s.get("markets") else "value_comparison"
    return "hash_comparison"

# ===================================================================== 6. RECURSOS MULTIPLES (fuentes compuestas)
# fuentes con mas de un recurso con cadencia/volatilidad propia -- el resto usa un recurso "default"
MULTI_RESOURCE = {
    "bcu": [
        {"id": "cotizaciones", "name": "Cotizaciones diarias", "volatility": "high", "priority": "critical"},
        {"id": "cuentas-nacionales", "name": "Cuentas nacionales (PIB)", "volatility": "low", "priority": "high"},
        {"id": "tasas-y-expectativas", "name": "Tasas de interés y expectativas", "volatility": "medium", "priority": "high"},
    ],
    "adme": [
        {"id": "despacho-horario", "name": "Despacho y generación por fuente", "volatility": "high", "priority": "critical",
         "frequency": "every_6_hours"},
        {"id": "datos-abiertos-historicos", "name": "Series históricas de datos abiertos", "volatility": "low", "priority": "medium"},
    ],
    "inac": [
        {"id": "faena-y-precios", "name": "Faena semanal y precios de hacienda", "volatility": "high", "priority": "critical"},
        {"id": "exportaciones", "name": "Exportaciones por corte y destino", "volatility": "medium", "priority": "critical"},
    ],
    "miem-dne": [
        {"id": "precios-combustibles", "name": "Precios de combustibles", "volatility": "high", "priority": "critical"},
        {"id": "balance-energetico", "name": "Balance Energético Nacional", "volatility": "low", "priority": "high"},
    ],
    "ine": [
        {"id": "ipc", "name": "Índice de Precios del Consumo", "volatility": "medium", "priority": "critical"},
        {"id": "empleo", "name": "Encuesta Continua de Hogares (empleo)", "volatility": "medium", "priority": "high"},
        {"id": "ivf-industria", "name": "Índice de volumen físico industrial", "volatility": "low", "priority": "medium"},
    ],
    "uruguay-xxi": [
        {"id": "sie-comercio-exterior", "name": "Sistema de Información Estadística (48 h)", "volatility": "high", "priority": "critical"},
        {"id": "informes-sectoriales", "name": "Informes sectoriales y de mercado", "volatility": "low", "priority": "high"},
    ],
    "ursea": [
        {"id": "precios-paridad-combustibles", "name": "Informe mensual de precios de paridad", "volatility": "high", "priority": "high"},
    ],
    "mgap-diea": [
        {"id": "anuario", "name": "Anuario Estadístico Agropecuario", "volatility": "low", "priority": "critical"},
        {"id": "encuestas-de-campana", "name": "Encuestas de campaña (intra-anuales)", "volatility": "medium", "priority": "critical"},
    ],
    "inale": [
        {"id": "remision-y-precio", "name": "Remisión y precio al productor", "volatility": "medium", "priority": "critical"},
        {"id": "precios-internacionales-referencia", "name": "Precios internacionales de referencia (GDT)", "volatility": "high", "priority": "critical"},
    ],
    "impo": [
        {"id": "diario-oficial", "name": "Diario Oficial (normativa nueva)", "volatility": "event", "priority": "critical"},
    ],
}

def resources_of(s):
    if s["id"] in MULTI_RESOURCE:
        return MULTI_RESOURCE[s["id"]]
    return [{"id": "principal", "name": s["name"], "volatility": None, "priority": None, "frequency": None}]

# ===================================================================== 7. FALLBACK (desde mappings.json)
led_domains = collections.defaultdict(list)
for r in MAP:
    for sid in r["primary"]:
        led_domains[sid].append(r)

def fallback_of(sid):
    out = {}
    for r in led_domains.get(sid, []):
        alts = [x for x in (r["fallback"] + r["secondary"]) if x != sid]
        if alts:
            out[r["domain"]] = alts
    return out

# ===================================================================== 8. ENSAMBLADO
monitors = []
for s in SRC:
    vol_default = volatility_of(s)
    adapter = adapter_of(s)
    automation = s["access"]["automation"]
    fb = fallback_of(s["id"])
    for res in resources_of(s):
        vol = res["volatility"] or vol_default
        prio = res["priority"] or s["priority"]
        freq = res.get("frequency") or (FREQ_OVERRIDES.get(s["id"]) if len(resources_of(s)) == 1 else None)
        if freq is None:
            freq = base_frequency(prio, vol)
        if automation == "manual":
            freq = cap_for_manual(freq)
        cd = change_detection_of(adapter, s)
        scope = {}
        if s.get("markets"):
            scope["parametrized_by"] = "market"
            scope["parameters"] = s["markets"]
        mon = {
            "id": f"{s['id']}::{res['id']}",
            "source_id": s["id"],
            "resource_id": res["id"],
            "resource_name": res["name"],
            "enabled": True,
            "method": adapter,
            "frequency": freq,
            "priority": prio,
            "volatility": vol,
            "automation": automation,
            "scope": scope,
            "change_detection": {"method": cd},
            "fallback": {"activation": "on_failure_or_unavailable", "by_domain": fb} if fb else None,
            "last_run": None, "last_success": None, "last_change": None,
            "notes": s.get("notes", "") if res["id"] in ("principal",) else "",
        }
        monitors.append(mon)

# ===================================================================== 9. VALIDACIONES
errs = []
mids = [m["id"] for m in monitors]
if len(mids) != len(set(mids)):
    errs.append("IDs de monitor duplicados")
for m in monitors:
    if m["source_id"] not in SBYID:
        errs.append(f"{m['id']}: source_id inexistente")
    if m["method"] not in ADAPTERS:
        errs.append(f"{m['id']}: metodo desconocido {m['method']}")
    if m["change_detection"]["method"] not in CD_CATALOG:
        errs.append(f"{m['id']}: deteccion desconocida")
    if m["frequency"] not in FREQUENCIES:
        errs.append(f"{m['id']}: frecuencia invalida {m['frequency']}")

# ===================================================================== 10. GAPS -> impacto en senales futuras
SIGNAL_IMPACT = {
 "precios-de-plasticos-y-quimicos": ["precios", "costos"],
 "precios-de-metales-y-siderurgia": ["precios", "costos"],
 "fletes-y-logistica-internacional": ["costos", "infraestructura-logistica"],
 "mercado-de-carbono-y-sostenibilidad": ["precios", "regulacion"],
 "adopcion-tecnologica-y-digitalizacion": ["tecnologia"],
 "inteligencia-artificial-y-automatizacion": ["tecnologia"],
 "transporte-carretero": ["costos", "infraestructura-logistica"],
 "disponibilidad-de-talento-especializado": ["empleo-talento"],
 "costos-de-materiales-de-construccion": ["costos"],
 "almacenaje-y-cadena-de-frio": ["infraestructura-logistica", "oferta"],
}
DOMFILES = {}
for fn in ("transversal.json", "mercados.json", "sectoriales.json"):
    for d in json.load(open(ROOT + "/knowledge/domain-names/" + fn, encoding="utf-8"))["domains"]:
        DOMFILES[d["id"]] = d
mon_gaps = []
for g in GAPS["domains_without_full_coverage"]:
    d = DOMFILES.get(g["domain"], {})
    acts = d.get("related_activities", [])
    mon_gaps.append({
        "domain": g["domain"], "coverage": g["coverage"],
        "activities_affected": len(acts) if isinstance(acts, list) else acts,
        "future_signal_types_affected": SIGNAL_IMPACT.get(g["domain"], []),
        "monitoring_status": "proxy_monitored" if any(
            m["source_id"] in [x for r in MAP if r["domain"] == g["domain"] for x in (r["primary"] + r["fallback"])]
            for m in monitors) else "not_monitored",
        "note": g["note"],
    })

# ===================================================================== 11. SALIDA
open(OUT + "/monitors.json", "w", encoding="utf-8").write(json.dumps(
    {"generated": GEN_DATE, "note": "Configuracion de monitoreo. No contiene credenciales ni datos capturados.",
     "monitors": monitors}, ensure_ascii=False, indent=2) + "\n")

open(OUT + "/methods.json", "w", encoding="utf-8").write(json.dumps(
    {"generated": GEN_DATE,
     "error_taxonomy": ["success", "partial_success", "timeout", "rate_limit", "authentication_error",
                        "not_found", "server_error", "invalid_response", "parse_error", "source_unavailable"],
     "adapters": ADAPTERS}, ensure_ascii=False, indent=2) + "\n")

open(OUT + "/change-detection.json", "w", encoding="utf-8").write(json.dumps(
    {"generated": GEN_DATE,
     "change_classes": ["sin_cambio", "cambio_de_contenido", "nuevo_registro", "registro_eliminado",
                        "valor_modificado", "estructura_modificada", "fuente_no_disponible", "error_de_adquisicion"],
     "methods": CD_CATALOG,
     "thresholds": {"types": ["absolute_threshold", "relative_threshold", "percentage_threshold", "minimum_variation"],
                    "note": "Disponibles para value_comparison; los umbrales concretos se definen en la capa signals/."}},
    ensure_ascii=False, indent=2) + "\n")

open(OUT + "/frequencies.json", "w", encoding="utf-8").write(json.dumps(
    {"generated": GEN_DATE,
     "vocabulary": FREQUENCIES,
     "principle": "monitor_frequency != publication_frequency_code. Se deriva de (priority x volatility), no se copia de sources/.",
     "priority_x_volatility_table": {f"{k[0]}/{k[1]}": v for k, v in FREQ_TABLE.items()},
     "manual_cap": "Una fuente con access.automation=manual nunca se programa mas seguido que weekly.",
     "overrides": FREQ_OVERRIDES}, ensure_ascii=False, indent=2) + "\n")

open(OUT + "/gaps.json", "w", encoding="utf-8").write(json.dumps(
    {"generated": GEN_DATE, "source": "knowledge/sources/gaps.json",
     "domains_without_full_coverage": mon_gaps}, ensure_ascii=False, indent=2) + "\n")

by_freq = collections.Counter(m["frequency"] for m in monitors)
by_method = collections.Counter(m["method"] for m in monitors)
by_cd = collections.Counter(m["change_detection"]["method"] for m in monitors)
by_automation = collections.Counter(m["automation"] for m in monitors)
manual_high = sorted({m["source_id"] for m in monitors if m["automation"] == "manual" and m["priority"] in ("critical", "high")})
with_fallback = sum(1 for m in monitors if m["fallback"])

idx = {"generated": GEN_DATE,
       "inputs": ["knowledge/sources/sources.json", "knowledge/sources/mappings.json", "knowledge/sources/gaps.json"],
       "counts": {
         "monitors_total": len(monitors),
         "sources_covered": len(SRC),
         "compound_sources_with_multiple_resources": len(MULTI_RESOURCE),
         "by_frequency": dict(by_freq),
         "by_method": dict(by_method),
         "by_change_detection": dict(by_cd),
         "by_automation": dict(by_automation),
         "monitors_with_fallback_configured": with_fallback,
         "manual_high_priority_sources": manual_high,
         "gaps_carried_forward": len(mon_gaps),
       }}
open(OUT + "/_index.json", "w", encoding="utf-8").write(json.dumps(idx, ensure_ascii=False, indent=2) + "\n")

print("errores:", len(errs))
for e in errs[:30]:
    print("  ", e)
print(json.dumps(idx["counts"], ensure_ascii=False, indent=2))
