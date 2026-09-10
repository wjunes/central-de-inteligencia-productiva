import json, os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ACT = json.load(open(ROOT + "/knowledge/activities/activities.json", encoding="utf-8"))
SEC = json.load(open(ROOT + "/knowledge/activities/sectors.json", encoding="utf-8"))
acts = ACT["activities"]
byid = {a["id"]: a for a in acts}
OUT = ROOT + "/knowledge/ramifications"
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- visible names
NAMES = {
 "clima": "Clima", "sequia": "Sequía", "deficit-hidrico": "Déficit hídrico",
 "exceso-hidrico": "Exceso hídrico", "heladas": "Heladas", "olas-de-calor": "Olas de calor",
 "disponibilidad-agua": "Disponibilidad de agua", "hidrologia": "Hidrología",
 "recurso-hidrico": "Recurso hídrico", "recurso-eolico": "Recurso eólico",
 "recurso-solar": "Recurso solar", "incendios": "Incendios forestales",
 "frio-invernal": "Horas de frío invernal", "floracion": "Floración",
 "tipo-de-cambio": "Tipo de cambio", "inflacion": "Inflación",
 "tasa-interes": "Tasa de interés", "salario-real": "Salario real",
 "costos-laborales": "Costos laborales", "costo-energia": "Costo de la energía",
 "combustibles": "Combustibles", "precio-petroleo": "Precio del petróleo",
 "costos-logisticos": "Costos logísticos", "costo-insumos": "Costo de los insumos",
 "costo-materiales": "Costo de los materiales", "flete-internacional": "Flete marítimo internacional",
 "precios-internacionales": "Precios internacionales", "precios-commodities": "Precios de commodities",
 "precios-chicago": "Precios de referencia (Chicago)", "precio-granos": "Precio de los granos",
 "precio-acero": "Precio del acero", "precio-fertilizantes": "Precio de los fertilizantes",
 "acuerdos-comerciales": "Acuerdos comerciales", "acceso-mercados": "Acceso a mercados y barreras",
 "demanda-china": "Demanda de China", "demanda-externa": "Demanda externa",
 "demanda-regional": "Demanda regional", "demanda-internacional": "Demanda internacional",
 "consumo-interno": "Consumo interno", "demanda-construccion": "Demanda de la construcción",
 "demanda-agro": "Demanda del agro", "comercio-exterior": "Comercio exterior",
 "situacion-argentina-brasil": "Situación económica de Argentina y Brasil",
 "normativa-sectorial": "Normativa sectorial", "normativa-sanitaria": "Normativa sanitaria",
 "normativa-ambiental": "Normativa ambiental", "normativa-territorial": "Normativa de ordenamiento territorial",
 "sanidad-animal": "Sanidad animal", "sanidad-vegetal": "Sanidad vegetal",
 "sanidad-acuicola": "Sanidad acuícola", "trazabilidad": "Trazabilidad",
 "habilitaciones-sanitarias": "Habilitaciones sanitarias", "inversion-publica": "Inversión pública",
 "inversion-privada": "Inversión privada", "inversion-extranjera": "Inversión extranjera directa",
 "disponibilidad-talento": "Disponibilidad de talento", "mano-de-obra": "Mano de obra",
 "mano-de-obra-especializada": "Mano de obra especializada", "estacionalidad": "Estacionalidad",
 "conectividad-aerea": "Conectividad aérea", "conectividad": "Conectividad",
 "conectividad-internacional": "Conectividad internacional", "flujo-turistico": "Flujo turístico",
 "turismo-receptivo": "Turismo receptivo", "energia": "Energía", "agua": "Agua",
 "pasturas": "Pasturas", "suelo": "Suelo", "reservas-forrajeras": "Reservas forrajeras",
 "granos-forrajeros": "Granos forrajeros", "raciones-balanceadas": "Raciones balanceadas",
 "genetica-animal": "Genética animal", "genetica-bovina": "Genética bovina",
 "genetica-lechera": "Genética lechera", "semillas": "Semillas", "fertilizantes": "Fertilizantes",
 "agroquimicos": "Agroquímicos", "agua-riego": "Agua de riego", "maquinaria-agricola": "Maquinaria agrícola",
 "normativa-promocion": "Regímenes de promoción de inversiones",
 "regimen-zonas-francas": "Régimen de zonas francas", "regimen-promocion-software": "Régimen de promoción del software",
 "regimen-vivienda-promovida": "Régimen de vivienda promovida", "regimen-automotriz": "Régimen automotriz",
 "impuestos-especificos": "Impuestos específicos (IMESI)", "subsidios": "Subsidios",
 "tarifa-regulada": "Tarifa regulada", "financiamiento": "Financiamiento", "credito": "Crédito",
 "credito-hipotecario": "Crédito hipotecario", "capital-trabajo": "Capital de trabajo",
 "oferta-ganado": "Oferta de ganado", "oferta-lana": "Oferta de lana", "oferta-cueros": "Oferta de cueros",
 "remision-leche": "Remisión de leche", "abastecimiento-madera": "Abastecimiento de madera",
 "abastecimiento-grano": "Abastecimiento de grano", "abastecimiento-cana": "Abastecimiento de caña",
 "abastecimiento-materia-prima": "Abastecimiento de materia prima", "cuotas-captura": "Cuotas de captura",
 "estado-recursos": "Estado de los recursos pesqueros", "estado-recursos-costeros": "Estado de los recursos costeros",
 "ley-mineral": "Ley del mineral", "reservas": "Reservas explotables", "licencia-ambiental": "Autorización ambiental",
 "represas-riego": "Represas de riego", "dragado": "Dragado", "calado-canales": "Calado de canales",
 "infraestructura-portuaria": "Infraestructura portuaria", "interconexiones": "Interconexiones eléctricas regionales",
 "capacidad-transmision": "Capacidad de transmisión", "caminos-rurales": "Caminos rurales",
 "estado-rutas": "Estado de las rutas", "peajes": "Peajes", "infraestructura-gasoducto": "Infraestructura de gasoducto",
 "adopcion-tecnologica": "Adopción tecnológica", "propiedad-intelectual": "Propiedad intelectual",
 "vinculacion-academia-empresa": "Vinculación academia-empresa", "competencia-importada": "Competencia de productos importados",
 "importaciones-competencia": "Competencia de importaciones", "competencia-regional-puertos": "Competencia regional de puertos",
 "actividad-economica": "Nivel de actividad económica", "ciclo-economico": "Ciclo económico",
 "ciclo-economico-regional": "Ciclo económico regional", "ciclo-politico": "Ciclo político y de inversión pública",
 "gasto-publico-salud": "Gasto público en salud", "informalidad": "Informalidad",
 "urbanizacion": "Urbanización", "volumen-forestal": "Volumen de cosecha forestal",
 "politica-agroenergetica": "Política agroenergética", "politica-energetica": "Política energética",
 "mandato-mezcla": "Mandato de mezcla de biocombustibles", "posicionamiento-marca-pais": "Posicionamiento de marca país",
 "estabilidad-macro": "Estabilidad macroeconómica", "estabilidad": "Estabilidad institucional",
 "diferencia-precios-frontera": "Diferencia de precios en frontera",
}

def vname(tok):
    if tok in NAMES: return NAMES[tok]
    if tok in byid: return byid[tok]["name"]
    return tok.replace("-", " ").capitalize()

# ---------------------------------------------------------------- categorisation
def cat_of(tok, field):
    t = tok
    def has(*xs): return any(x in t for x in xs)
    if has("normativa","regimen","licencia-ambiental","registro","marco-regulatorio","marco-normativo",
           "impuestos","trazabilidad","habilitaciones","acuerdos-comerciales","acuerdos-aerocomerciales",
           "subsidios","tarifa-regulada","mandato","cuotas-captura","propiedad-intelectual","proteccion-propiedad",
           "normativa-inase","normativa-pesos","exigencia-regulatoria","politica-agroenergetica","politica-energetica"):
        return "regulatory_factors"
    if has("clima","sequia","hidrico","hidrologia","incendios","frio-invernal","floracion","heladas","olas-de-calor"):
        return "climate_factors"
    if t in ("agua","disponibilidad-agua","suelo","recurso-hidrico","recurso-eolico","recurso-solar",
             "reservas","ley-mineral","estado-recursos","estado-recursos-costeros","suelos-prioridad-forestal",
             "fuentes-agua","disponibilidad-fuentes","recursos-naturales","pasturas","reservas-forrajeras"):
        return "resources"
    if has("sanid","sanitar"): return "sanitary_factors"
    if has("ambient","efluentes","carbono","residuos","vertidos"): return "environmental_factors"
    if has("costo","precio","flete","peajes","margenes","arancel"): return "cost_factors"
    if has("financ","credito","tasa-interes","capital","aval"): return "financial_factors"
    if has("inversion"): return "economic_factors"
    if has("demanda","consumo","flujo-turistico","turismo-receptivo","estacionalidad","preferencias"): return "demand_factors"
    if has("infra","puerto","gasoducto","interconex","transmision","caminos","rutas","dragado","calado","represas","red-"):
        return "infrastructure"
    if has("logistic","cadena-frio","cadena-suministro","almacenaje","transporte-cana","transporte-forestal"): return "logistics"
    if has("talento","mano-de-obra","idiomas","padron-profesionales","salario","laboral"): return "labor_factors"
    if has("tecnolog","adopcion-tecnologica","genetica","vinculacion-academia","electroliz"): return "technologies"
    if has("competencia","competidor"): return "competitive_factors"
    if has("tipo-de-cambio","inflacion","comercio-exterior","precios-internacionales","precios-commodities",
            "precios-chicago","situacion-argentina","ciclo-economico","actividad-economica","competitividad",
            "acceso-mercados","diferencia-precios-frontera","posicionamiento-marca-pais","estabilidad"):
        return "economic_factors"
    if has("abastecimiento","oferta-","remision-","zafra-","cosecha","campana-agricola"): return "inputs"
    return {"products":"products","inputs":"inputs","dependencies":"resources",
            "impact_factors":"economic_factors","markets":"markets"}.get(field,"economic_factors")

CRIT_DEP = {"clima","disponibilidad-agua","hidrologia","sanidad-animal","sanidad-vegetal","oferta-ganado",
 "remision-leche","cuotas-captura","estado-recursos","estado-recursos-costeros","acceso-mercados",
 "abastecimiento-madera","abastecimiento-grano","abastecimiento-cana","abastecimiento-materia-prima",
 "abastecimiento-rolos","abastecimiento-biomasa","abastecimiento-fibra","abastecimiento-combustibles",
 "habilitaciones-sanitarias","licencia-ambiental","ley-mineral","recurso-eolico","recurso-solar",
 "recurso-hidrico","precio-petroleo","represas-riego","planta-industrial-unica","dragado","trazabilidad",
 "energia-renovable","conectividad-internacional","regimen-zonas-francas","disponibilidad-talento",
 "mandato-mezcla","subsidios","tarifa-regulada","contratos-importacion","interconexiones"}

DIRECT_IMPACT = {"clima","sequia","hidrologia","tipo-de-cambio","precios-internacionales","demanda-china",
 "demanda-externa","consumo-interno","precio-petroleo","recurso-eolico","costo-energia","combustibles",
 "estacionalidad","situacion-argentina-brasil","normativa-sectorial","normativa-sanitaria","normativa-ambiental",
 "sanidad-animal","sanidad-vegetal","disponibilidad-agua","disponibilidad-talento","inversion-publica",
 "conectividad-aerea","demanda-construccion","impuestos-especificos"}

def rel_of(cat):
    return {"regulatory_factors":"regulation","cost_factors":"cost","financial_factors":"cost",
            "resources":"dependency","infrastructure":"infrastructure","logistics":"dependency",
            "climate_factors":"impact","sanitary_factors":"impact","environmental_factors":"impact",
            "demand_factors":"impact","competitive_factors":"competitor","technologies":"complement",
            "labor_factors":"dependency","economic_factors":"impact","inputs":"input",
            "products":"output","markets":"market"}.get(cat,"impact")

def reciprocal(a_id, b_id):
    b = byid.get(b_id)
    return bool(b) and a_id in b.get("related_activities", [])

def ram_from_token(tok, field, act):
    if tok in byid:  # relation to another activity
        tgt = byid[tok]
        if _crit_pair(act["id"], tok):
            rv = "critical"
        elif field == "related_activities" and reciprocal(act["id"], tok):
            rv = "high"
        else:
            rv = "medium"
        return {"id": tok, "name": tgt["name"], "category": "related_activities",
                "relation": "related_activity", "target_activity_id": tok,
                "direction": "direct", "relevance": rv, "depth": 1, "children": []}
    cat = cat_of(tok, field)
    rel = rel_of(cat)
    if field == "markets":
        cat, rel = "markets", "market"
    if field == "products":
        cat, rel = "products", "output"
    # relevance
    if field == "markets":
        rv = "critical" if (act.get("markets") and act["markets"][0] == "exportacion" and tok == "exportacion") else "high"
    elif field == "related_activities":
        rv = "critical" if _crit_pair(act["id"], tok) else "high"
    elif field == "dependencies":
        rv = "critical" if tok in CRIT_DEP else "high"
    elif field == "inputs":
        rv = "high" if cat in ("resources", "infrastructure") else "medium"
    elif field == "products":
        rv = "low"
    else:  # impact_factors
        rv = "high" if tok in DIRECT_IMPACT else "medium"
    direction = "direct"
    if field == "impact_factors":
        direction = "direct" if tok in DIRECT_IMPACT else "indirect"
    if cat in ("climate_factors",) and tok in ("sequia","deficit-hidrico","exceso-hidrico","heladas","olas-de-calor","incendios"):
        rel = "risk"
    return {"id": tok, "name": vname(tok), "category": cat, "relation": rel,
            "direction": direction, "relevance": rv, "depth": 1, "children": []}

CRIT_PAIRS = {
 ("ganaderia","frigorifica"),("ganaderia-bovina-carne","frigorifica"),("ganaderia-ovina","frigorifica"),
 ("lecheria","industria-lactea"),("industria-lactea","lecheria"),
 ("cultivo-cana-azucar","industria-azucarera"),("industria-azucarera","cultivo-cana-azucar"),
 ("silvicultura","industria-celulosa"),("cosecha-forestal","industria-celulosa"),
 ("industria-celulosa","silvicultura"),("arroz","molineria"),("molineria","arroz"),
 ("frigorifica","ganaderia"),("agricultura-secano","acopio-granos"),("acopio-granos","agricultura-secano"),
 ("cultivo-soja","elaboracion-aceites"),("elaboracion-aceites","agricultura-secano"),
 ("pesca-industrial","industria-pesquera"),("industria-pesquera","pesca-industrial"),
 ("generacion-electrica","transmision-distribucion-electrica"),
 ("transmision-distribucion-electrica","generacion-electrica"),
 ("hidrogeno-verde","generacion-eolica"),("hidrogeno-verde","puertos-terminales"),
 ("silvicultura","transporte-carga-carretera"),("industria-celulosa","puertos-terminales"),
 ("frigorifica","puertos-terminales"),("acopio-granos","puertos-terminales"),
 ("comercio-exterior","puertos-terminales"),("citricultura","industria-frutihorticola"),
 ("viticultura","vinos"),("ganaderia-ovina","industria-textil-vestimenta"),
 ("lavaderos-tops-lana","ganaderia-ovina"),
}
def _crit_pair(a, b): return (a, b) in CRIT_PAIRS

# ---------------------------------------------------------------- rule-based risk/opp
def rules_risk_opp(act):
    out = []
    imp = set(act.get("impact_factors", [])); dep = set(act.get("dependencies", []))
    mk = set(act.get("markets", [])); sec = act["sector_id"]
    both = imp | dep
    def add(i, n, c, r, rv, d="indirect"):
        out.append({"id": i, "name": n, "category": c, "relation": r,
                    "direction": d, "relevance": rv, "depth": 1, "children": []})
    if sec in ("agropecuario","forestal-celulosa","pesca-acuicultura") and both & {"clima","sequia","hidrologia","disponibilidad-agua"}:
        add("evento-climatico-adverso","Evento climático adverso","risks","risk","high","direct")
    if "exportacion" in mk:
        add("cierre-o-restriccion-de-mercados","Cierre o restricción de mercados de exportación","risks","risk","high")
        add("apertura-de-nuevos-mercados","Apertura de nuevos mercados","opportunities","opportunity","medium")
    if both & {"precios-internacionales","precios-commodities","precios-chicago"}:
        add("caida-de-precios-internacionales","Caída sostenida de precios internacionales","risks","risk","high")
        add("suba-sostenida-de-precios","Suba sostenida de precios internacionales","opportunities","opportunity","medium")
    if "demanda-china" in both:
        add("concentracion-de-la-demanda-en-china","Concentración de la demanda en China","risks","risk","high")
    if both & {"normativa-ambiental"}:
        add("endurecimiento-de-exigencias-ambientales","Endurecimiento de exigencias ambientales","risks","risk","medium")
    if both & {"acuerdos-comerciales"}:
        add("nuevos-acuerdos-comerciales","Nuevos acuerdos comerciales","opportunities","opportunity","medium")
    if both & {"inversion-extranjera","incentivos-inversion","normativa-promocion","regimen-zonas-francas"}:
        add("atraccion-de-inversion","Atracción de inversión y nuevos proyectos","opportunities","opportunity","medium")
    if both & {"disponibilidad-talento"}:
        add("escasez-de-talento-especializado","Escasez de talento especializado","risks","risk","high","direct")
    if both & {"precio-petroleo"} and sec != "energia":
        add("shock-de-precio-del-petroleo","Shock de precio del petróleo","risks","risk","medium")
    return out

# ---------------------------------------------------------------- build
CURATED = json.load(open(os.path.join(os.path.dirname(__file__), "curated.json"), encoding="utf-8"))

index = []
edge_count = 0
for act in acts:
    rams = []
    seen = set()
    order = ["dependencies","inputs","related_activities","markets","products","impact_factors"]
    for field in order:
        for tok in act.get(field, []):
            key = tok
            if key in seen:
                continue
            seen.add(key)
            rams.append(ram_from_token(tok, field, act))
    for ro in rules_risk_opp(act):
        if ro["id"] not in seen:
            seen.add(ro["id"]); rams.append(ro)
    # curated enrichment (children / extra risks-opps / relevance overrides)
    cur = CURATED.get(act["id"])
    if cur:
        for ov in cur.get("relevance_overrides", []):
            for r in rams:
                if r["id"] == ov["id"]:
                    r["relevance"] = ov["relevance"]
        for r in rams:
            ch = cur.get("children", {}).get(r["id"])
            if ch:
                r["children"] = [c for c in ch if c["id"] not in seen]
                for c in r["children"]:
                    seen.add(c["id"])
        for extra in cur.get("add", []):
            if extra["id"] not in seen:
                seen.add(extra["id"]); rams.append(extra)
    edges = [r["target_activity_id"] for r in rams if r.get("relation") == "related_activity"]
    edge_count += len(edges)
    doc = {
        "activity_id": act["id"],
        "activity_name": act["name"],
        "sector_id": act["sector_id"],
        "level": act["level"],
        "parent_activity_id": act.get("parent_id"),
        "ramification_count": len(rams),
        "ramifications": rams,
    }
    fn = OUT + "/" + act["id"] + ".json"
    open(fn, "w", encoding="utf-8").write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    index.append({"activity_id": act["id"], "level": act["level"], "sector_id": act["sector_id"],
                  "file": act["id"] + ".json", "ramification_count": len(rams),
                  "related_activities": edges})

idx = {
    "generated": "2026-09-10",
    "source": "knowledge/activities/activities.json",
    "counts": {
        "activity_files": len(index),
        "activities": sum(1 for i in index if i["level"] == "activity"),
        "subactivities": sum(1 for i in index if i["level"] == "subactivity"),
        "ramifications_total": sum(i["ramification_count"] for i in index),
        "cross_activity_edges": edge_count,
    },
    "activities": index,
}
open(OUT + "/_index.json", "w", encoding="utf-8").write(json.dumps(idx, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(idx["counts"], indent=2))
