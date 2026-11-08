#!/usr/bin/env python3
"""Synkar tidtabellsdata mot Ressels webbtabeller (båda linjerna).

    python3 tools/sync_ressel.py [--write] [--emelie-html F] [--sjo-html F] [--pdf URL|F ...]

Webbtabellerna på ressel.se/emelie-trafiken/ (city) och ressel.se/sjostadstrafiken/
(sjo) är primär källa. Utan --write skrivs bara en sammanfattning; med --write
skrivs datafiler och configar och validatorn körs. Idempotent: en andra körning
ger inga ändringar. Exit 0 även när ändringar finns, exit 1 vid tolkningsfel.

city  Jämför varje icke-passerad webbperiod mot season_mapping. Samma period:
      tider som skiljer skrivs om (delad fil -> ny fil, andra säsonger rörs aldrig).
      Ny period: ny säsong med filer som tools/import_emelie.py. PDF:en (hämtas
      från sidans länkar, eller --pdf) ger röda dagar och används som kontroll:
      varje skillnad mot webben är en VARNING (webben vinner).
sjo   Öppen sista säsong (2099) behålls. Ny/ändrad period kapar den och lägger
      tillbaka en öppen säsong efter (antagande, varnas för). Svenska röda dagar
      fylls på i holiday_rules.weekend_schedule (aldrig borttag).

Dataformatet är ett publikt kontrakt (hallskärmen läser det): strukturen ändras
inte, _metadata.version bumpas bara minor. Se MAINTENANCE.md.
"""

import argparse
import copy
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_emelie as imp  # noqa: E402
import ressel_web as web  # noqa: E402
import validate  # noqa: E402

ROOT = imp.ROOT
CITY_CONFIG = imp.CONFIG_NAME
SJO_CONFIG = "ressel-sjo-config.json"
NEVER = "\0"   # prefix som aldrig matchar: räkna alla filer som återanvändbara
EMELIE_SRC = "ressel.se/emelie-trafiken"
SJO_SRC = "ressel.se/sjostadstrafiken"


# === Hjälpare ===============================================================

def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def load(data_dir, fn):
    with open(os.path.join(data_dir, fn), encoding="utf-8") as f:
        return json.load(f)


def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": web.USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="replace")


def pd(s):
    return date.fromisoformat(s)


def list_diff(old, new):
    """'+10:32 -10:28' för två tidslistor."""
    o, n = set(old), set(new)
    parts = [f"+{t}" for t in sorted(n - o, key=validate.to_min)] + [f"-{t}" for t in sorted(o - n, key=validate.to_min)]
    if not parts and old != new:
        parts = ["(ordningen skiljer)"]
    return " ".join(parts)


def norm_diff(cur, new):
    """Rader som beskriver skillnaden mellan två normaliserade city-filer."""
    lines = []
    if cur is None:
        return ["(filens struktur kunde inte jämföras, skrivs om)"]
    for section, label in (("to_city", "till city"), ("from_city", "från city"), ("dis", "endast avstigning")):
        a, b = cur.get(section, {}), new.get(section, {})
        for stop in sorted(set(a) | set(b)):
            d = list_diff(a.get(stop, []), b.get(stop, []))
            if d:
                lines.append(f"{label} {stop}: {d}")
    return lines


def dump_json_file(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def is_flat(data):
    blocks = validate.collect_blocks(data)
    return bool(blocks) and all(len(bp) == 1 for bp, _ in blocks)


def free_name(data_dir, taken, base):
    """base.json, annars base-2.json ... som varken finns på disk eller är tagen."""
    n, fn = 1, f"{base}.json"
    while os.path.exists(os.path.join(data_dir, fn)) or fn in taken:
        n += 1
        fn = f"{base}-{n}.json"
    return fn


# === Svenska röda dagar =====================================================

def easter(y):
    """Påskdagen (anonym gregoriansk algoritm)."""
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return date(y, month, day)


def swedish_holidays(y):
    """{datum: namn} för årets röda dagar (inte aftnar, inte pingstdagen)."""
    e = easter(y)
    midsommar = next(date(y, 6, d) for d in range(20, 27) if date(y, 6, d).weekday() == 5)
    helgons = next(d for d in (date(y, 10, 31) + timedelta(days=n) for n in range(7)) if d.weekday() == 5)
    return {
        date(y, 1, 1): "Nyårsdagen", date(y, 1, 6): "Trettondedag jul",
        e - timedelta(days=2): "Långfredagen", e: "Påskdagen", e + timedelta(days=1): "Annandag påsk",
        date(y, 5, 1): "Första maj", e + timedelta(days=39): "Kristi himmelsfärdsdag",
        date(y, 6, 6): "Nationaldagen", midsommar: "Midsommardagen", helgons: "Alla helgons dag",
        date(y, 12, 25): "Juldagen", date(y, 12, 26): "Annandag jul",
    }


# === PDF (röda dagar och kontroll för city) =================================

def read_pdf(text, name, ref, stop_sequence):
    """Tolkar en pdftotext-text. Returnerar dict; tables är None om tabellerna inte gick att tolka."""
    text = imp.nfc(text)
    info = {"name": name, "ref": ref, "warnings": [], "errors": [], "infos": []}
    info["title"] = imp.parse_title(text)
    info["start"], info["end"] = imp.parse_period(text)
    tables, _ = imp.parse_tables(text, stop_sequence, info["warnings"])
    imp.check_tables(tables, stop_sequence, info["errors"])
    info["tables"] = None if info["errors"] else tables
    nt, wk = imp.parse_notes(text, info["start"], info["end"], info["warnings"], info["errors"], info["infos"])
    info["no_traffic"], info["weekend"] = nt, wk
    return info


def pdf_vs_web(pdf, p):
    """Varje skillnad mellan PDF-tabellerna och webbperioden som en rad."""
    out = []
    for day in imp.DAY_TYPES:
        for direction in ("to_city", "from_city"):
            a = pdf["tables"][day][direction]
            b = p["days"][day][direction]
            for stop in sorted(set(a) | set(b)):
                ta, tb = a.get(stop, []), b.get(stop, [])
                if ta != tb:
                    out.append(f"{day}/{direction} {stop}: PDF och webb skiljer ({list_diff([x for x, _ in ta], [x for x, _ in tb]) or 'avstigningsmarkering'})")
    return out


# === city ===================================================================

def derive_title(start):
    """Titel i PDF-stil när ingen PDF finns ('VINTER 2027/2028')."""
    m = start.month
    if m in (11, 12, 1, 2):
        y1 = start.year if m >= 11 else start.year - 1
        return f"VINTER {y1}/{y1 + 1}"
    return {3: "VÅR", 4: "VÅR", 5: "VÅR", 6: "SOMMAR", 7: "SOMMAR"}.get(m, "HÖST") + f" {start.year}"


def sync_city(periods, pdfs, data_dir, today, parse_errors):
    """Returnerar dict med lines, warnings, errors, cfg_text (None om oförändrad) och file_writes."""
    res = {"lines": [], "warnings": [], "errors": list(parse_errors), "cfg_text": None, "file_writes": {}, "changes": 0}
    L, W = res["lines"], res["warnings"]
    cfg_text = read(os.path.join(data_dir, CITY_CONFIG))
    cfg = json.loads(cfg_text)
    stops = cfg["service_configuration"]["stop_sequence"]
    seasons = cfg["season_mapping"]            # arbetskopia, muteras
    pdf_by_period = {(p["start"], p["end"]): p for p in pdfs}
    used_pdfs = set()
    edits = []                                 # säsonger att skriva till configen
    writes = res["file_writes"]
    pending = {}                               # json(norm) -> filnamn skapad i körningen

    if not periods:
        L.append("Inga icke-passerade perioder på webben.")
    for p in periods:
        start, end = p["start"], p["end"]
        pdf = pdf_by_period.get((start, end))
        if pdf:
            used_pdfs.add((start, end))
        days = {d: imp.build_day(p["days"][d], stops) for d in imp.DAY_TYPES}
        L.append(f"Period {start} till {end}" + (f" (PDF: {pdf['name']})" if pdf else " (ingen matchande PDF)"))

        pdf_diffs = []
        if pdf and pdf["tables"] is not None:
            pdf_diffs = pdf_vs_web(pdf, p)
        elif pdf:
            W.append(f"{start}: PDF:en {pdf['name']} kunde inte jämföras mot webben: {'; '.join(pdf['errors'])}")
        for d in pdf_diffs:
            W.append(f"{start}: {d} (webben används)")

        season = next((s for s in seasons if s["period"]["start"] == start.isoformat()), None)
        if season is None:
            clash = next((s for s in seasons if pd(s["period"]["start"]) <= end and pd(s["period"]["end"]) >= start), None)
            if clash:
                res["errors"].append(f"Period {start}–{end} överlappar säsongen {clash['name']} ({clash['period']['start']}–{clash['period']['end']}) utan att börja samma dag. Åtgärda manuellt.")
                L.append(f"  FEL: överlappar {clash['name']}, hoppas över")
                continue
            _new_city_season(p, days, pdf, seasons, edits, writes, pending, cfg, stops, data_dir, today, L, W)
            res["changes"] += 1
            continue

        # Befintlig säsong
        changed = False
        new_season = copy.deepcopy(season)
        if season["period"]["end"] != end.isoformat():
            W.append(f"{season['name']}: periodens slut på webben är {end}, i configen {season['period']['end']}. Configen uppdateras.")
            new_season["period"]["end"] = end.isoformat()
            changed = True
        other_files = {fn for s in seasons if s is not season for fn in s["files"].values()}
        todo = []
        for d in imp.DAY_TYPES:
            fn = season["files"][d]
            cur = imp.normalized(load(data_dir, fn))
            new = imp.normalized(days[d])
            if cur != new:
                todo.append((d, fn, new, norm_diff(cur, new)))
        if not todo:
            L.append(f"  {season['name']}: oförändrad")
        for d, fn, new, diff in todo:
            L.append(f"  {season['name']} {d} ({fn}): ÄNDRADE TIDER")
            for ln in diff:
                L.append(f"      {ln}")
            key = json.dumps(new, sort_keys=True)
            reuse = imp.find_reusable(new, data_dir, d, NEVER)
            old = load(data_dir, fn)
            same_slots = [x for x in imp.DAY_TYPES if season["files"][x] == fn]
            slots_equal = all(imp.normalized(days[x]) == new for x in same_slots)
            if reuse and reuse != fn:
                target = reuse
                L.append(f"      -> pekar på befintlig identisk fil {reuse}")
            elif key in pending:
                target = pending[key]
                L.append(f"      -> delar {target}")
            elif fn not in other_files and is_flat(old) and slots_equal:
                target = fn
                writes[fn] = _city_data(old.get("metadata"), d, season["name"], start, end, days[d], stops, "uppdaterad")
                pending[key] = fn
                L.append(f"      -> skriver om {fn} (används bara av den här säsongen)")
            else:
                base = f"ressel-city-{imp.title_to_slug(season['name'])}-{d}"
                target = free_name(data_dir, writes, base)
                writes[target] = _city_data(None, d, season["name"], start, end, days[d], stops, "ny")
                pending[key] = target
                why = "delas med andra säsonger" if fn in other_files else ("nästlad struktur" if not is_flat(old) else "delas med annan dagtyp med andra tider")
                L.append(f"      -> ny fil {target} ({fn} {why}, ändras inte)")
            new_season["files"][d] = target
            changed = True
        # Helgregler ur PDF
        if pdf:
            hr = new_season.get("holiday_rules")
            pn = [x.isoformat() for x in pdf["no_traffic"]]
            pw = [x.isoformat() for x in pdf["weekend"]]
            if hr is None and (pn or pw):
                new_season["holiday_rules"] = {k: v for k, v in (("no_traffic", pn), ("weekend_schedule", pw)) if v}
                L.append(f"  {season['name']}: lägger till helgregler ur PDF:en (no_traffic {len(pn)}, weekend_schedule {len(pw)})")
                changed = True
            elif hr is not None:
                for key, want in (("no_traffic", pn), ("weekend_schedule", pw)):
                    if sorted(hr.get(key, [])) != sorted(want):
                        W.append(f"{season['name']}: {key} i configen {sorted(hr.get(key, []))} skiljer från PDF:en {sorted(want)}")
        if changed:
            edits.append((new_season, False, (f"{EMELIE_SRC} (webbtabell)", EMELIE_SRC)))
            season.clear()
            season.update(new_season)
            res["changes"] += 1

    for key, pdf in sorted(pdf_by_period.items()):
        if key not in used_pdfs and pdf["end"] >= today:
            W.append(f"PDF:en {pdf['name']} ({pdf['start']}–{pdf['end']}) har ingen motsvarande webbperiod. Kör tools/import_emelie.py manuellt om den ska in.")

    if edits:
        text = cfg_text
        for season, _new, entry in edits:
            text, _, _ = imp.update_config_text(text, season, entry, today.isoformat(), bump=False)
        text, note = imp.bump_version(text, today.isoformat())
        res["cfg_text"] = text
        L.append(f"Config {CITY_CONFIG}: {len(edits)} säsong(er) skrivs, {note}")
    return res


def _city_data(old_meta, day, season_name, start, end, day_data, stops, kind):
    n = len(day_data["to_city"]["departures"][stops["to_city"][0]])
    meta = copy.deepcopy(old_meta) if old_meta else {
        "description": f"M/S Emelie {imp.DAY_SV[day]} {season_name}", "day_type": day}
    meta["note"] = f"{imp.fmt_sv(start)} - {imp.fmt_sv(end)}. {n} avgångar mot city. Källa: {EMELIE_SRC} (webbtabell)"
    return {"metadata": meta, **day_data}


def _new_city_season(p, days, pdf, seasons, edits, writes, pending, cfg, stops, data_dir, today, L, W):
    start, end = p["start"], p["end"]
    title = pdf["title"] if pdf else derive_title(start)
    slug = imp.title_to_slug(title)
    name = imp.title_to_season_name(title)
    if any(s["name"] == name for s in seasons) or os.path.exists(os.path.join(data_dir, f"ressel-city-{slug}-weekday.json")):
        title = f"{title} från {start}"
        slug, name = imp.title_to_slug(title), f"{name} ({start})"
    source_name = pdf["name"] if pdf else f"{EMELIE_SRC} (webbtabell)"
    source_ref = pdf["ref"] if pdf else web.EMELIE_URL
    L.append(f"  NY SÄSONG {name} ({start} till {end}), källa {source_name}")
    for day in imp.DAY_TYPES:
        dd = days[day]
        seq = stops["to_city"]
        n_to = len(dd["to_city"]["departures"][seq[0]])
        dis = "; ".join(f"{d}: " + ", ".join(f"{s} {','.join(t)}" for s, t in st.items()) for d, st in dd["disembark_only"].items() if st) or "inga"
        L.append(f"    {day:9} {n_to} turer, första/sista {dd['to_city']['departures'][seq[0]][0]}/{dd['to_city']['departures'][seq[0]][-1]}, endast avstigning: {dis}")
    anomalies = []
    for day in imp.DAY_TYPES:
        for direction, (modal, odd) in imp.anomalies(p["days"][day], stops).items():
            for first, actual, usual in odd:
                det = ", ".join(f"{s} {t} (vanligen +{usual[s]})" for s, t in actual.items())
                anomalies.append(f"{day}/{direction}: tur {first} avviker: {det}")
    for a in anomalies:
        W.append(f"{name}: avvikande tur tagen som på webben, kontrollera mot tryckt tabell: {a}")
    files_plan, flines = imp.plan_files(days, data_dir, slug, title, start, end, source_name, stops)
    # filer som skapats tidigare i körningen får inte skrivas över av en annan säsong
    for ln in flines:
        L.append("  " + ln)
    for day in imp.DAY_TYPES:
        fn, status, data = files_plan[day]
        if data is not None:
            writes[fn] = data
    hr = {}
    if pdf:
        if pdf["no_traffic"]:
            hr["no_traffic"] = [x.isoformat() for x in pdf["no_traffic"]]
        if pdf["weekend"]:
            hr["weekend_schedule"] = [x.isoformat() for x in pdf["weekend"]]
        for w in pdf["warnings"]:
            W.append(f"{name}: PDF: {w}")
        for e in pdf["errors"]:
            W.append(f"{name}: PDF: {e}")
        L.append(f"    helgregler ur PDF: no_traffic {', '.join(hr.get('no_traffic', [])) or '-'}; weekend_schedule {', '.join(hr.get('weekend_schedule', [])) or '-'}")
        for i in pdf["infos"]:
            L.append(f"    (info) {i}")
    else:
        W.append(f"{name}: ingen matchande PDF. Säsongen skapas UTAN helgregler (röda dagar, ingen trafik). Lägg in dem manuellt eller kör tools/import_emelie.py när PDF:en finns.")
    season = {"name": name, "period": {"start": start.isoformat(), "end": end.isoformat()},
              "files": {d: files_plan[d][0] for d in imp.DAY_TYPES}}
    if hr:
        season["holiday_rules"] = hr
    season["source_pdf"] = source_ref
    reused = sorted({v[0] for v in files_plan.values() if v[1] == "återanvänds"})
    season["note"] = (f"{imp.fmt_sv(start)} - {imp.fmt_sv(end)} ({source_name}). Skapad av tools/sync_ressel.py."
                      + (f" Återanvänder {', '.join(reused)}." if reused else "")
                      + (" Avvikande tur(er) importerade som på webben." if anomalies else "")
                      + ("" if pdf else " Helgregler saknas (ingen PDF vid skapandet)."))
    seasons.append(season)
    edits.append((season, True, (f"CITY LINE {title} ({source_name})", source_name) if pdf else (f"{EMELIE_SRC} (webbtabell)", EMELIE_SRC)))


# === sjo ====================================================================

def sjo_has_rush(deps):
    m = [validate.to_min(t) for t in deps]
    return any(b - a == 10 for a, b in zip(m, m[1:]))


def sjo_name(start, end, weekday_first_stop):
    rush = "med rusningstid" if sjo_has_rush(weekday_first_stop) else "utan rusningstid"
    if start.month in (6, 7, 8) and (end - start).days < 120:
        return f"Sommar {start.year} ({rush})"
    y1 = start.year if start.month >= 7 else start.year - 1
    return f"Höst/Vinter/Vår {y1}-{y1 + 1} ({rush})"


def dump_sjo_file(data):
    """Datafil i repots stil: en rad per timme och brygga."""
    blocks = []
    for stop, times in data["departures"].items():
        groups, cur, hour = [], [], None
        for t in times:
            h = t[:2]
            if h != hour and cur:
                groups.append(cur)
                cur = []
            hour = h
            cur.append(t)
        if cur:
            groups.append(cur)
        lines = ",\n".join("      " + ", ".join(json.dumps(t) for t in g) for g in groups)
        blocks.append(f"    {json.dumps(stop, ensure_ascii=False)}: [\n{lines}\n    ]")
    return ("{\n  \"metadata\": " + imp.dump_json(data["metadata"], 2) + ",\n  \"operating_hours\": "
            + imp.dump_json(data["operating_hours"], 2) + ",\n  \"departures\": {\n" + ",\n".join(blocks) + "\n  }\n}\n")


def sjo_data(old_meta, day, name, start, end, deps, today):
    first = next(iter(deps.values()))
    meta = copy.deepcopy(old_meta) if old_meta else {
        "description": "Sjöstadstrafiken " + ("vardagstidtabell" if day == "weekday" else "helgtidtabell (lördag & söndag)") + f" {name}",
        "day_type": day}
    meta["note"] = f"{imp.fmt_sv(start)} - {imp.fmt_sv(end)}. Källa: {SJO_SRC} (webbtabell, synkad {today})"
    return {"metadata": meta, "operating_hours": {"start": first[0], "end": first[-1]}, "departures": deps}


def rewrite_seasons(text, new_seasons):
    """Skriver om season_mapping men behåller oförändrade säsongers originaltext."""
    key = text.index('"season_mapping"')
    arr_open = text.index("[", key)
    spans, arr_close = imp.array_object_spans(text, arr_open)
    pool = [(json.loads(text[a:b]), text[a:b]) for a, b in spans]
    blocks = []
    for s in new_seasons:
        hit = next((i for i, (d, _) in enumerate(pool) if d == s), None)
        if hit is not None:
            blocks.append(pool.pop(hit)[1])
        else:
            blocks.append(imp.dump_json(s, 4))
    return text[:arr_open + 1] + "\n    " + ",\n    ".join(blocks) + "\n  " + text[arr_close:]


def rewrite_weekend_schedule(text, dates):
    k = text.index('"weekend_schedule"')
    o = text.index("[", k)
    c = imp.find_matching(text, o)
    rows = []
    for y in sorted({d[:4] for d in dates}):
        ds = [d for d in dates if d[:4] == y]
        for i in range(0, len(ds), 6):
            rows.append("      " + ", ".join(json.dumps(d) for d in ds[i:i + 6]))
    return text[:o] + "[\n" + ",\n".join(rows) + "\n    ]" + text[c + 1:]


def sync_sjo(periods, data_dir, today):
    res = {"lines": [], "warnings": [], "errors": [], "cfg_text": None, "file_writes": {}, "changes": 0}
    L, W = res["lines"], res["warnings"]
    cfg_text = read(os.path.join(data_dir, SJO_CONFIG))
    cfg = json.loads(cfg_text)
    stops = cfg["service_configuration"]["stop_sequence"]
    seasons = copy.deepcopy(cfg["season_mapping"])
    writes = res["file_writes"]

    def file_deps(fn):
        return load(data_dir, fn)["departures"]

    def start_of(s):
        return pd(s["period"]["start"])

    def end_of(s):
        return pd(s["period"]["end"])

    for p in periods:
        P0, P1 = p["start"], p["end"]
        web_days = {d: {s: p["stops"][s][d] for s in stops} for d in ("weekday", "weekend")}
        L.append(f"Period {P0} till {P1}")
        S = next((s for s in seasons if start_of(s) <= P0 <= end_of(s)), None)
        if S is None:
            res["errors"].append(f"Period {P0}–{P1} börjar utanför alla säsonger i {SJO_CONFIG}. Åtgärda manuellt.")
            L.append("  FEL: ingen säsong täcker periodens start")
            continue
        todo = {}
        for d in ("weekday", "weekend"):
            cur = file_deps(S["files"][d])
            if cur != web_days[d]:
                todo[d] = cur
        if not todo:
            L.append(f"  {S['name']}: oförändrad (tiderna matchar {S['files']['weekday']} och {S['files']['weekend']})")
            if P1 < end_of(S):
                L.append(f"  (info) webbperioden slutar {P1}; säsongen gäller enligt konfigen till {S['period']['end']} (öppet slut behålls medvetet)")
            continue
        newfiles = dict(S["files"])
        newname = sjo_name(P0, P1, web_days["weekday"][stops[0]])
        for d, cur in todo.items():
            fn = S["files"][d]
            L.append(f"  {S['name']} {d} ({fn}): ÄNDRADE TIDER")
            for stop in stops:
                dd = list_diff(cur.get(stop, []), web_days[d][stop])
                if dd:
                    L.append(f"      {stop}: {dd}")
            reuse = None
            for cand in sorted(os.listdir(data_dir)):
                if cand.startswith("ressel-sjo-") and cand != SJO_CONFIG and cand.endswith(".json"):
                    try:
                        if file_deps(cand) == web_days[d]:
                            reuse = cand
                            break
                    except (KeyError, ValueError, OSError):
                        pass
            refs = [s for s in seasons if fn in s["files"].values()]
            inplace = (all(P0 <= start_of(s) and end_of(s) <= P1 for s in refs)
                       and sum(1 for v in S["files"].values() if v == fn) == 1)
            if reuse:
                newfiles[d] = reuse
                L.append(f"      -> pekar på befintlig identisk fil {reuse}")
            elif inplace:
                writes[fn] = sjo_data(load(data_dir, fn).get("metadata"), d, S["name"], P0, P1, web_days[d], today)
                L.append(f"      -> skriver om {fn} (används bara av säsonger inom perioden)")
            else:
                slug = imp.title_to_slug(newname.split(" (")[0])
                target = free_name(data_dir, writes, f"ressel-sjo-{d}-{slug}")
                writes[target] = sjo_data(None, d, newname, P0, P1, web_days[d], today)
                newfiles[d] = target
                L.append(f"      -> ny fil {target} ({fn} används av andra säsonger, ändras inte)")
        idx = next(i for i, s in enumerate(seasons) if s is S)
        old_files = dict(S["files"])
        S_start, S_end = start_of(S), end_of(S)
        if S_start == P0 and S_end == P1:
            S["files"] = newfiles
        elif S_start == P0 and S_end < P1:
            S["files"] = newfiles
            W.append(f"{S['name']}: webbperioden slutar {P1}, efter säsongens slut {S_end}. Säsongens slut ändras inte.")
        else:
            new_s = {"name": newname, "period": {"start": P0.isoformat(), "end": P1.isoformat(),
                                                 "note": f"Skapad av tools/sync_ressel.py från {SJO_SRC} ({today})."},
                     "files": newfiles}
            parts = []
            if S_start < P0:
                S["period"]["end"] = (P0 - timedelta(days=1)).isoformat()
                parts.append(S)
                L.append(f"  -> kapar {S['name']} till {S['period']['end']}")
            parts.append(new_s)
            L.append(f"  -> ny säsong {newname} ({P0} till {P1})")
            if P1 < S_end:
                rs = P1 + timedelta(days=1)
                rname = sjo_name(rs, S_end, file_deps(old_files["weekday"])[stops[0]])
                parts.append({"name": rname, "period": {"start": rs.isoformat(), "end": S_end.isoformat(),
                                                       "note": f"Antagande: återgår till föregående säsongs filer efter {P1}. Verifiera mot ressel.se när nästa period publiceras."},
                              "files": old_files})
                L.append(f"  -> återöppnar {rname} ({rs} till {S_end}) med {old_files['weekday']} och {old_files['weekend']}")
                W.append(f"sjo: efter {P1} läggs en ny öppen säsong in med föregående öppna säsongs filer ({old_files['weekday']}, {old_files['weekend']}). Det är ett ANTAGANDE, verifiera när Ressel publicerar tider för perioden efter.")
            seasons[idx:idx + 1] = parts
        res["changes"] += 1

    # Röda dagar: lägg bara till, aldrig ta bort (aftnar mm finns där avsiktligt)
    cur_h = list(cfg.get("holiday_rules", {}).get("weekend_schedule", []))
    want = {}
    for y in (today.year, today.year + 1):
        want.update({d: n for d, n in swedish_holidays(y).items() if d >= today})
    add = sorted(d for d in want if d.isoformat() not in cur_h)
    if add:
        L.append("Röda dagar som läggs till i holiday_rules.weekend_schedule:")
        for d in add:
            L.append(f"  {d} {want[d]} ({['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön'][d.weekday()]})")
        res["changes"] += 1
    else:
        L.append(f"Röda dagar: weekend_schedule täcker {today.year} och {today.year + 1} (från {today})")

    if res["changes"]:
        text = cfg_text
        if seasons != cfg["season_mapping"]:
            text = rewrite_seasons(text, seasons)
        if add:
            text = rewrite_weekend_schedule(text, sorted(set(cur_h) | {d.isoformat() for d in add}))
        if text != cfg_text:
            text, note = imp.bump_version(text, today.isoformat())
            res["cfg_text"] = text
            L.append(f"Config {SJO_CONFIG}: {note}")
    return res


# === Huvudflöde =============================================================

def run(emelie_html, sjo_html, pdf_inputs, data_dir, write, today=None):
    """pdf_inputs: [(pdftotext-text, namn, referens)]. Returnerar (text, exitkod, ändrat?)."""
    today = today or date.today()
    out = []
    P = out.append
    code = 0
    city_cfg = json.loads(read(os.path.join(data_dir, CITY_CONFIG)))
    sjo_cfg = json.loads(read(os.path.join(data_dir, SJO_CONFIG)))
    city_stops = city_cfg["service_configuration"]["stop_sequence"]
    sjo_stops = sjo_cfg["service_configuration"]["stop_sequence"]

    parse_errors, fatal = [], []
    periods_c = periods_s = None
    try:
        periods_c = web.parse_emelie(emelie_html, city_stops, today, parse_errors)
    except web.WebParseError as e:
        fatal.append(str(e))
    try:
        periods_s = [p for p in web.parse_sjo(sjo_html, sjo_stops) if p["end"] >= today]
    except web.WebParseError as e:
        fatal.append(str(e))

    pdfs, pdf_warn = [], []
    for text, name, ref in pdf_inputs:
        try:
            info = read_pdf(text, name, ref, city_stops)
        except imp.ImportError_ as e:
            pdf_warn.append(f"PDF:en {name} kunde inte tolkas: {e}")
            continue
        if info["end"] >= today:
            pdfs.append(info)

    P(f"Synk mot ressel.se, datum {today}")
    P("")
    P("=== M/S Emelie (city) ===")
    city = sync_city(periods_c, pdfs, data_dir, today, parse_errors) if periods_c is not None else None
    sjo = sync_sjo(periods_s, data_dir, today) if periods_s is not None else None
    for f in fatal:
        P(f"FEL: {f}")
    if city:
        out.extend(city["lines"])
        for e in city["errors"]:
            P(f"FEL: {e}")
    P("")
    P("=== Sjöstadstrafiken (sjo) ===")
    if sjo:
        out.extend(sjo["lines"])
        for e in sjo["errors"]:
            P(f"FEL: {e}")

    warnings = pdf_warn + (city["warnings"] if city else []) + (sjo["warnings"] if sjo else [])
    errors = fatal + (city["errors"] if city else []) + (sjo["errors"] if sjo else [])
    if warnings:
        P("")
        P("VARNINGAR:")
        for w in warnings:
            P(f"  - {w}")
    n_c = city["changes"] if city else 0
    n_s = sjo["changes"] if sjo else 0
    P("")
    P(f"Sammanfattning: city {n_c} ändring(ar), sjo {n_s} ändring(ar), {len(warnings)} varning(ar), {len(errors)} fel.")
    if errors:
        code = 1
    changed = bool(n_c or n_s)

    if not write:
        if changed:
            P("Inget skrivet. Kör igen med --write för att skriva ändringarna.")
        return "\n".join(out) + "\n", code, changed

    if changed:
        for res, cfgname in ((city, CITY_CONFIG), (sjo, SJO_CONFIG)):
            if not res:
                continue
            for fn, data in res["file_writes"].items():
                text = dump_sjo_file(data) if fn.startswith("ressel-sjo-") else imp.dump_data_file(data)
                dump_json_file(os.path.join(data_dir, fn), text)
            if res["cfg_text"]:
                json.loads(res["cfg_text"])
                dump_json_file(os.path.join(data_dir, cfgname), res["cfg_text"])
        P("")
        P("Skrivet. Kör validatorn...")
        rep = validate.validate(data_dir)
        for w in rep.warnings:
            P(f"  validator VARNING {w}")
        for e in rep.errors:
            P(f"  validator FEL {e}")
        P(f"  validator: {len(rep.errors)} fel, {len(rep.warnings)} varningar")
        if rep.errors:
            code = 1
    return "\n".join(out) + "\n", code, changed


def main(argv=None):
    ap = argparse.ArgumentParser(description="Synka tidtabellsdata mot Ressels webbtabeller")
    ap.add_argument("--write", action="store_true", help="skriv ändringar (annars bara sammanfattning)")
    ap.add_argument("--emelie-html", help="lokal HTML i stället för att hämta ressel.se/emelie-trafiken/")
    ap.add_argument("--sjo-html", help="lokal HTML i stället för att hämta ressel.se/sjostadstrafiken/")
    ap.add_argument("--pdf", action="append", default=[], help="Emelie-PDF (URL eller fil), kan upprepas. Default: länkarna på webbsidan (om den hämtas live)")
    ap.add_argument("--no-pdf", action="store_true", help="hämta inga PDF:er")
    ap.add_argument("--data-dir", default=os.path.join(ROOT, "data"))
    ap.add_argument("--today", help="ÅÅÅÅ-MM-DD (för tester)")
    args = ap.parse_args(argv)
    today = date.fromisoformat(args.today) if args.today else date.today()
    try:
        emelie_html = read(args.emelie_html) if args.emelie_html else fetch_text(web.EMELIE_URL)
        sjo_html = read(args.sjo_html) if args.sjo_html else fetch_text(web.SJO_URL)
    except (OSError, urllib.error.URLError) as e:
        print(f"FEL: kunde inte läsa webbsidorna: {e}", file=sys.stderr)
        return 1
    srcs = list(args.pdf)
    if not srcs and not args.emelie_html and not args.no_pdf:
        srcs = web.pdf_links(emelie_html)
    pdf_inputs, notes = [], []
    for src in srcs:
        try:
            pdf_inputs.append(imp.fetch_pdf_text(src))
        except (imp.ImportError_, OSError, urllib.error.URLError) as e:
            notes.append(f"VARNING: PDF {src} kunde inte hämtas/läsas: {e}")
    out, code, _ = run(emelie_html, sjo_html, pdf_inputs, args.data_dir, args.write, today)
    for n in notes:
        print(n)
    sys.stdout.write(out)
    return code


if __name__ == "__main__":
    sys.exit(main())
