#!/usr/bin/env python3
"""Importerar en M/S Emelie-tidtabell (linjen `city`) från Ressels PDF.

    python3 tools/import_emelie.py <pdf-sökväg|url> [--write] [--source URL]

Utan --write skrivs bara en sammanfattning. Med --write skapas/uppdateras
datafiler och säsongen i data/ressel-city-config.json, och validatorn körs.

Kräver Python 3 (stdlib) och `pdftotext` (poppler-utils). Läs MAINTENANCE.md
för flödet och vad som granskas.

Dataformatet är ett publikt kontrakt (hallskärmen läser det) och ändras inte
här: platta filer med metadata, to_city/from_city {operating_hours, departures}
och disembark_only. _metadata.version bumpas bara minor.

Tolkningen bygger på att pdftotext -layout blandar kartans text och flera
tabeller på samma rad. Därför letas `<Bryggnamn> (HH:MM[*]|Lunch)+` var som
helst på raden, och dagtyp/riktning styrs av rubrikerna `Måndag - Fredag`,
`Lördag`, `Söndag` och `Tur: A > B`. Allt som inte kan tolkas ger en varning.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.request
from collections import Counter
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validate  # noqa: E402  (delad hjälpkod: collect_blocks)

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
CONFIG_NAME = "ressel-city-config.json"
DAY_TYPES = ("weekday", "saturday", "sunday")
DAY_HEADINGS = {"Måndag - Fredag": "weekday", "Lördag": "saturday", "Söndag": "sunday"}
DAY_SV = {"weekday": "vardagstidtabell", "saturday": "lördagstidtabell", "sunday": "söndagstidtabell"}

MONTHS = {
    "jan": 1, "januari": 1, "feb": 2, "februari": 2, "mar": 3, "mars": 3,
    "apr": 4, "april": 4, "maj": 5, "jun": 6, "juni": 6, "jul": 7, "juli": 7,
    "aug": 8, "augusti": 8, "sep": 9, "sept": 9, "september": 9,
    "okt": 10, "oktober": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
MONTH_NAMES = ["januari", "februari", "mars", "april", "maj", "juni", "juli",
               "augusti", "september", "oktober", "november", "december"]
SEASON_EN = {"VINTER": "Winter", "VINTERN": "Winter", "VÅR": "Spring", "VÅREN": "Spring",
             "SOMMAR": "Summer", "SOMMAREN": "Summer", "HÖST": "Autumn", "HÖSTEN": "Autumn"}

TIME_TOKEN = r"(?:\d{1,2}:\d{2}\*?|Lunch)"
HEADING_RE = re.compile(
    r"(?<![\wåäöÅÄÖ])(Måndag\s*-\s*Fredag|Lördag|Söndag)(?![\wåäöÅÄÖ])"
    r"(?=\s+\d{1,2}\s+[A-Za-zåäöÅÄÖ]+\s+\d{4})")
TUR_RE = re.compile(r"Tur:\s*Hammarbysjöstad\s*>\s*Nybroplan|Tur:\s*Nybroplan\s*>\s*Hammarbysjöstad")
PERIOD_RE = re.compile(
    r"(\d{1,2})\s+([A-Za-zåäöÅÄÖ]+)\s+(\d{4})\s*[-–]\s*(\d{1,2})\s+([A-Za-zåäöÅÄÖ]+)\s+(\d{4})")
# Rader som är kända och ofarliga; allt annat som liknar en notis ger varning
NOTICE_HINT_RE = re.compile(r"\b(OBS|Extra|extra|lov|Lov|uppehåll|inställd|ändrad|ändrade|Stängt|Ingen trafik|Helgtrafik)\b")
BENIGN_RE = re.compile(r"betalning med kort|Endast avstigning|NOTER HELGTRAFIK|Ingen trafik\s+\d|Helgtrafik\s+\d")


class ImportError_(Exception):
    pass


def nfc(s):
    return unicodedata.normalize("NFC", s)


# === Hämtning ===============================================================

def fetch_pdf_text(src):
    """Returnerar (text, källnamn, källa). Ladda ner vid URL."""
    tmp = None
    if re.match(r"^https?://", src):
        req = urllib.request.Request(src, headers={"User-Agent": "ressel-static-import/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(data)
        tmp.close()
        path = tmp.name
        name = os.path.basename(src.split("?")[0])
    else:
        path = src
        name = os.path.basename(src)
    try:
        res = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, check=True)
    except FileNotFoundError:
        raise ImportError_("pdftotext saknas (installera poppler-utils)")
    except subprocess.CalledProcessError as e:
        raise ImportError_(f"pdftotext misslyckades: {e.stderr.decode(errors='replace')[:200]}")
    finally:
        if tmp:
            os.unlink(tmp.name)
    return res.stdout.decode("utf-8", errors="replace"), name, (src if tmp else name)


# === Tolkning ===============================================================

def parse_month(s):
    return MONTHS.get(s.lower().rstrip("."))


def parse_period(text):
    m = PERIOD_RE.search(text)
    if not m:
        raise ImportError_("hittar ingen giltighetsperiod ('9 NOVEMBER 2026 - 29 MARS 2027')")
    d1, mo1, y1, d2, mo2, y2 = m.groups()
    if parse_month(mo1) is None or parse_month(mo2) is None:
        raise ImportError_(f"okänd månad i perioden: {m.group(0)!r}")
    start = date(int(y1), parse_month(mo1), int(d1))
    end = date(int(y2), parse_month(mo2), int(d2))
    if start > end:
        raise ImportError_(f"perioden slutar före den börjar: {m.group(0)!r}")
    return start, end


def parse_title(text):
    for line in text.splitlines():
        m = re.search(r"CITY LINE\s+(.+?)(?:\s{3,}|\t|$)", line)
        if m:
            return m.group(1).strip()
    raise ImportError_("hittar ingen titel ('CITY LINE ...')")


def title_to_slug(title):
    s = title.lower().replace("å", "a").replace("ä", "a").replace("ö", "o")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def title_to_season_name(title):
    words = title.split()
    en = SEASON_EN.get(words[0].upper()) if words else None
    rest = " ".join(words[1:]).replace("/", "-")
    if en:
        return f"{en} {rest}".strip()
    return title.title().replace("/", "-")


def parse_tables(text, stop_sequence, warnings):
    """Returnerar {dagtyp: {riktning: {brygga: [(tid, stjärna)]}}} och sektionsperioder."""
    stops = [nfc(s) for s in sorted(set(stop_sequence["to_city"]) | set(stop_sequence["from_city"]), key=len, reverse=True)]
    stop_re = re.compile(r"(?<![\wåäöÅÄÖ])(" + "|".join(re.escape(s) for s in stops) + r")\s+((?:" + TIME_TOKEN + r"\s*)+)")
    tables = {}
    section_periods = {}
    day = direction = None
    seen_headings = []

    for lineno, raw in enumerate(text.splitlines(), 1):
        line = nfc(raw)
        events = []
        for m in HEADING_RE.finditer(line):
            events.append((m.start(), "day", DAY_HEADINGS[re.sub(r"\s+", " ", m.group(1))], m))
        for m in TUR_RE.finditer(line):
            events.append((m.start(), "dir", "to_city" if "Hammarbysjöstad >" in re.sub(r"\s+", " ", m.group(0)) else "from_city", m))
        line_stops = {}
        for m in stop_re.finditer(line):
            events.append((m.start(), "rows", m, m))
        events.sort(key=lambda e: e[0])
        consumed = False
        for pos, kind, val, m in events:
            if kind == "day":
                day = val
                direction = None
                seen_headings.append(day)
                pm = PERIOD_RE.search(line[m.end():])
                if pm:
                    try:
                        section_periods[day] = parse_period(pm.group(0))
                    except ImportError_:
                        pass
            elif kind == "dir":
                direction = val
            else:
                brygga, toks = val.group(1), val.group(2).split()
                if day is None or direction is None:
                    warnings.append(f"rad {lineno}: tidsrad för {brygga} utan känd rubrik (dagtyp/riktning), ignorerad")
                    continue
                if brygga in line_stops:
                    warnings.append(f"rad {lineno}: {brygga} förekommer flera gånger på samma rad (flera tabeller?), andra förekomsten ignorerad")
                    continue
                line_stops[brygga] = True
                rows = tables.setdefault(day, {}).setdefault(direction, {})
                if brygga in rows:
                    warnings.append(f"rad {lineno}: {brygga} ({day}/{direction}) förekommer i två tabeller, den senare ignorerad")
                    continue
                times = []
                for tk in toks:
                    if tk == "Lunch":
                        continue
                    star = tk.endswith("*")
                    h, mi = tk.rstrip("*").split(":")
                    times.append((f"{int(h):02d}:{mi}", star))
                rows[brygga] = times
                consumed = True
        # Notisliknande rader som ingen känner igen
        if not consumed and NOTICE_HINT_RE.search(line) and not BENIGN_RE.search(line):
            warnings.append(f"rad {lineno}: oklassad notis, kontrollera manuellt: {line.strip()[:120]!r}")
    return tables, section_periods


def check_tables(tables, stop_sequence, errors):
    for day in DAY_TYPES:
        if day not in tables:
            errors.append(f"dagtyp {day} saknas i PDF:en")
            continue
        for direction in ("to_city", "from_city"):
            rows = tables[day].get(direction)
            if rows is None:
                errors.append(f"{day}/{direction}: tabell saknas")
                continue
            missing = [s for s in stop_sequence[direction] if s not in rows]
            if missing:
                errors.append(f"{day}/{direction}: bryggor saknas: {missing}")
            counts = {s: len(t) for s, t in rows.items()}
            if len(set(counts.values())) > 1:
                errors.append(f"{day}/{direction}: olika antal tider per brygga {counts}")
            for s, t in rows.items():
                mins = [validate.to_min(x[0]) for x in t]
                if mins != sorted(set(mins)):
                    errors.append(f"{day}/{direction}/{s}: tiderna är inte stigande")


# === Notiser (holiday_rules) ================================================

def expand_dates(spec, start, end, errors, label):
    """'24-27 och 31 dec samt den 1 jan' -> [date, ...] inom perioden."""
    parts = [p.strip() for p in re.split(r"\s*(?:,|\boch\b|\bsamt\b)\s*", spec) if p.strip()]
    pat = re.compile(r"^(?:den\s+)?(\d{1,2})(?:\s+([a-zåäö]+))?(?:\s*[-–]\s*(\d{1,2})(?:\s+([a-zåäö]+))?)?\.?$", re.I)
    parsed = []
    for p in parts:
        m = pat.match(p)
        if not m:
            errors.append(f"{label}: kan inte tolka datumdelen {p!r}")
            return []
        parsed.append(list(m.groups()))
    # månad saknas -> ta från närmaste följande del med månad
    for i, g in enumerate(parsed):
        d1, mo1, d2, mo2 = g
        if d2 and not mo1:
            mo1 = mo2
        if not mo1:
            nxt = next((q[3] or q[1] for q in parsed[i + 1:] if (q[3] or q[1])), None)
            mo1 = nxt
        if d2 and not mo2:
            mo2 = mo1
        g[:] = [d1, mo1, d2, mo2]
    out = []
    for d1, mo1, d2, mo2 in parsed:
        if not mo1 or parse_month(mo1) is None:
            errors.append(f"{label}: månad saknas eller är okänd för {d1!r}")
            continue
        a = _resolve(int(d1), parse_month(mo1), start, end, errors, label)
        if a is None:
            continue
        if d2:
            b = _resolve(int(d2), parse_month(mo2), start, end, errors, label)
            if b is None:
                continue
            if b < a:
                errors.append(f"{label}: intervallet {a}–{b} är bakvänt")
                continue
            out.extend(a + timedelta(days=n) for n in range((b - a).days + 1))
        else:
            out.append(a)
    return out


def _resolve(day, month, start, end, errors, label):
    for y in range(start.year, end.year + 1):
        try:
            d = date(y, month, day)
        except ValueError:
            continue
        if start <= d <= end:
            return d
    errors.append(f"{label}: {day}/{month} ligger utanför perioden {start}–{end}")
    return None


def parse_notes(text, start, end, warnings, errors, infos):
    no_traffic, weekend = [], []
    flat = nfc(text)
    for m in re.finditer(r"Ingen trafik\s+(.+?)\.(?:\s|$)", flat):
        no_traffic.extend(expand_dates(m.group(1), start, end, errors, "Ingen trafik"))
    for m in re.finditer(r"Helgtrafik\s+(.+?)\.(?:\s|$)", flat):
        for d in expand_dates(m.group(1), start, end, errors, "Helgtrafik"):
            if d.weekday() < 5:
                weekend.append(d)
            else:
                infos.append(f"Helgtrafik {d} ({'lördag' if d.weekday() == 5 else 'söndag'}) utelämnad: har redan egen helgtabell")
    if not no_traffic and not weekend:
        warnings.append("inga noter om 'Ingen trafik'/'Helgtrafik' hittades, inga holiday_rules skapas")
    return sorted(set(no_traffic)), sorted(set(weekend))


# === Bygga datafiler ========================================================

def build_day(rows_by_dir, stop_sequence):
    """-> dict med to_city/from_city/disembark_only (utan metadata)."""
    out = {}
    dis = {}
    for direction in ("to_city", "from_city"):
        seq = stop_sequence[direction]
        rows = rows_by_dir[direction]
        deps = {s: [t for t, _ in rows[s]] for s in seq}
        out[direction] = {
            "operating_hours": {"start": deps[seq[0]][0], "end": deps[seq[-1]][-1]},
            "departures": deps,
        }
        stars = {s: [t for t, star in rows[s] if star] for s in seq}
        stars = {s: v for s, v in stars.items() if v}
        if stars:
            dis[direction] = stars
    dis.setdefault("from_city", {})
    out["disembark_only"] = dis
    return out


def normalized(data):
    """Jämförbar form: {riktning: {brygga: [tider]}} + disembark. Hanterar nästlade filer."""
    res = {"to_city": {}, "from_city": {}, "dis": {}}
    for bpath, block in validate.collect_blocks(data):
        d = bpath[0] if bpath and bpath[0] in ("to_city", "from_city") else None
        if d is None:
            return None
        for s, times in block["departures"].items():
            res[d].setdefault(s, []).extend(times)
    for d in res:
        if d != "dis":
            for s in res[d]:
                res[d][s] = sorted(res[d][s], key=validate.to_min)
    dis = data.get("disembark_only") or {}
    for d, stops in dis.items():
        if not isinstance(stops, dict):
            continue
        for s, times in stops.items():
            if isinstance(times, list) and times:
                res["dis"].setdefault(d, {})[s] = sorted(times, key=validate.to_min)
    return res


def find_reusable(norm, data_dir, day_type, own_prefix):
    """Befintlig datafil med identiskt innehåll. Filer med importens eget prefix
    (tidigare körning av samma säsong) räknas inte, annars blir körningen inte idempotent."""
    cands = []
    for fn in sorted(os.listdir(data_dir)):
        if not (fn.startswith("ressel-city-") and fn.endswith(".json")) or fn == CONFIG_NAME:
            continue
        if fn.startswith(own_prefix):
            continue
        try:
            with open(os.path.join(data_dir, fn), encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            continue
        n = normalized(d)
        if n == norm:
            same = (d.get("metadata", {}).get("day_type") == day_type)
            cands.append((not same, fn))
    return sorted(cands)[0][1] if cands else None


# === Avvikelser =============================================================

def anomalies(rows_by_dir, stop_sequence):
    """Modala restider (min från första bryggan) och turer som avviker."""
    res = {}
    for direction in ("to_city", "from_city"):
        seq = stop_sequence[direction]
        rows = rows_by_dir[direction]
        n = len(rows[seq[0]])
        offs = {s: [validate.to_min(rows[s][i][0]) - validate.to_min(rows[seq[0]][i][0]) for i in range(n)] for s in seq}
        modal = {s: Counter(offs[s]).most_common(1)[0][0] for s in seq}
        odd = []
        for i in range(n):
            diff = {s: offs[s][i] for s in seq if offs[s][i] != modal[s]}
            if diff:
                odd.append((rows[seq[0]][i][0], {s: rows[s][i][0] for s in seq if s in diff}, {s: modal[s] for s in diff}))
        res[direction] = (modal, odd)
    return res


# === Config-kirurgi (bevarar befintlig formatering) =========================

def dump_json(obj, indent=0, step=2):
    """json.dumps-lik, men listor med skalärer ligger på en rad (som i configen)."""
    pad = " " * (indent + step)
    if isinstance(obj, dict):
        if not obj:
            return "{}"
        items = [f"{pad}{json.dumps(k, ensure_ascii=False)}: {dump_json(v, indent + step, step)}" for k, v in obj.items()]
        return "{\n" + ",\n".join(items) + "\n" + " " * indent + "}"
    if isinstance(obj, list):
        if all(not isinstance(x, (dict, list)) for x in obj):
            return "[" + ", ".join(json.dumps(x, ensure_ascii=False) for x in obj) + "]"
        items = [pad + dump_json(x, indent + step, step) for x in obj]
        return "[\n" + ",\n".join(items) + "\n" + " " * indent + "]"
    return json.dumps(obj, ensure_ascii=False)


def dump_data_file(obj):
    """Datafil i repots stil: bryggor på egna rader, tider på en rad."""
    def dep(d, ind):
        pad = " " * ind
        w = max(len(json.dumps(k, ensure_ascii=False)) for k in d) + 1 if d else 0
        rows = []
        for k, v in d.items():
            key = (json.dumps(k, ensure_ascii=False) + ":").ljust(w + 1)
            rows.append(f"{pad}  {key} " + "[" + ",".join(json.dumps(x) for x in v) + "]")
        return "{\n" + ",\n".join(rows) + "\n" + pad + "}"

    def top(k, v):
        if k in ("to_city", "from_city"):
            oh = json.dumps(v["operating_hours"], ensure_ascii=False)
            return (f'  "{k}": {{\n    "operating_hours": {oh},\n    "departures": ' + dep(v["departures"], 4) + "\n  }")
        if k == "disembark_only":
            parts = []
            for d, stops in v.items():
                parts.append(f'    "{d}": ' + (dep(stops, 4) if stops else "{}"))
            return '  "disembark_only": {\n' + ",\n".join(parts) + "\n  }"
        return f'  "{k}": ' + dump_json(v, 2)
    return "{\n" + ",\n".join(top(k, v) for k, v in obj.items()) + "\n}\n"


def find_matching(text, i):
    """i pekar på '[' eller '{'; returnerar index för motsvarande slutparentes."""
    opener = text[i]
    closer = "]" if opener == "[" else "}"
    depth = 0
    in_str = False
    esc = False
    for j in range(i, len(text)):
        c = text[j]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == opener:
            depth += 1
        elif c == closer:
            depth -= 1
            if depth == 0:
                return j
    raise ImportError_("obalanserade parenteser i configen")


def array_object_spans(text, arr_open):
    arr_close = find_matching(text, arr_open)
    spans = []
    i = arr_open + 1
    while i < arr_close:
        if text[i] == "{":
            j = find_matching(text, i)
            spans.append((i, j + 1))
            i = j + 1
        else:
            i += 1
    return spans, arr_close


def update_config_text(text, season, source_entry, today):
    """Returnerar (ny text, ändrad?, notering)."""
    orig = text
    notes = []
    # 1. säsongen
    key = text.index('"season_mapping"')
    arr_open = text.index("[", key)
    spans, arr_close = array_object_spans(text, arr_open)
    block = "    " + dump_json(season, 4)
    found = None
    for a, b in spans:
        if json.loads(text[a:b]).get("period", {}).get("start") == season["period"]["start"]:
            found = (a, b)
            break
    if found:
        a, b = found
        text = text[:a] + block.lstrip() + text[b:]
        notes.append("säsongen fanns (samma period.start) och uppdaterades")
    else:
        last_end = spans[-1][1]
        text = text[:last_end] + ",\n" + block + text[last_end:]
        notes.append("säsongen lades till sist i season_mapping")
    # 2. data_sources
    cfg = json.loads(text)
    ds = cfg["_metadata"].get("data_sources", [])
    if not any(source_entry[1] in e for e in ds):
        k = text.index('"data_sources"')
        o = text.index("[", k)
        c = find_matching(text, o)
        last = text.rindex('"', o, c)
        text = text[:last + 1] + ",\n      " + json.dumps(source_entry[0], ensure_ascii=False) + text[last + 1:]
        notes.append("källa tillagd i _metadata.data_sources")
    changed = text != orig
    if changed:
        # 3. version (minor) + last_updated
        m = re.search(r'("_metadata"\s*:\s*\{\s*"version"\s*:\s*")(\d+)\.(\d+)\.(\d+)(")', text)
        if not m:
            raise ImportError_("hittar inte _metadata.version")
        new_v = f"{m.group(2)}.{int(m.group(3)) + 1}.0"
        text = text[:m.start()] + m.group(1) + new_v + m.group(5) + text[m.end():]
        text = re.sub(r'("last_updated"\s*:\s*")[^"]*(")', lambda mm: mm.group(1) + today + mm.group(2), text, count=1)
        notes.append(f"_metadata.version {m.group(2)}.{m.group(3)}.{m.group(4)} -> {new_v}")
    json.loads(text)  # måste fortfarande vara giltig JSON
    return text, changed, notes


# === Huvudflöde =============================================================

def fmt_sv(d):
    return f"{d.day} {MONTH_NAMES[d.month - 1]} {d.year}"


def run(pdf_text, source_name, source_ref, data_dir, write, today=None, skip_past=False):
    """Returnerar (utskriftstext, exitkod). Skriver bara vid write=True."""
    today = today or date.today().isoformat()
    warnings, errors, infos = [], [], []
    with open(os.path.join(data_dir, CONFIG_NAME), encoding="utf-8") as f:
        cfg_text = f.read()
    cfg = json.loads(cfg_text)
    stop_sequence = cfg["service_configuration"]["stop_sequence"]

    text = nfc(pdf_text)
    title = parse_title(text)
    start, end = parse_period(text)
    tables, sect_periods = parse_tables(text, stop_sequence, warnings)
    for day, p in sect_periods.items():
        if p != (start, end):
            warnings.append(f"{day}: sektionens period {p[0]}–{p[1]} avviker från titelns {start}–{end}")
    check_tables(tables, stop_sequence, errors)
    no_traffic, weekend = parse_notes(text, start, end, warnings, errors, infos)

    if skip_past and end.isoformat() < today:
        return f"Hoppar över: perioden {start} till {end} har redan passerat ({source_name}).\n", 0

    slug = title_to_slug(title)
    season_name = title_to_season_name(title)
    out = []
    P = out.append
    P(f"Titel:      CITY LINE {title}")
    P(f"Säsong:     {season_name}  ({start} till {end})")
    P(f"Källa:      {source_ref}")

    if errors:
        P("")
        for e in errors:
            P(f"FEL: {e}")
        for w in warnings:
            P(f"VARNING: {w}")
        return "\n".join(out) + "\n", 1

    days = {}
    files_plan = {}   # dagtyp -> (filnamn, ny?, data)
    pending = {}      # normaliserad form (json) -> filnamn skapad i den här körningen
    P("")
    P("Turer per dagtyp och riktning:")
    for day in DAY_TYPES:
        rows = tables[day]
        days[day] = build_day(rows, stop_sequence)
        n_to = len(days[day]["to_city"]["departures"][stop_sequence["to_city"][0]])
        n_from = len(days[day]["from_city"]["departures"][stop_sequence["from_city"][0]])
        dis = days[day]["disembark_only"]
        dis_txt = "; ".join(f"{d}: " + ", ".join(f"{s} {','.join(t)}" for s, t in stops.items()) for d, stops in dis.items() if stops) or "inga"
        P(f"  {day:9} till city {n_to}, från city {n_from}")
        P(f"            första/sista till city {days[day]['to_city']['departures'][stop_sequence['to_city'][0]][0]}/{days[day]['to_city']['departures'][stop_sequence['to_city'][0]][-1]} (Barnäng), "
          f"från city {days[day]['from_city']['departures'][stop_sequence['from_city'][0]][0]}/{days[day]['from_city']['departures'][stop_sequence['from_city'][0]][-1]} (Nybroplan)")
        P(f"            endast avstigning: {dis_txt}")

    P("")
    P("Restider (minuter från första bryggan, modala) och avvikande turer:")
    for day in DAY_TYPES:
        an = anomalies(tables[day], stop_sequence)
        for direction in ("to_city", "from_city"):
            modal, odd = an[direction]
            seq = stop_sequence[direction]
            if day == "weekday":
                P(f"  {direction}: " + ", ".join(f"{s} +{modal[s]}" for s in seq[1:]))
            for first, actual, usual in odd:
                det = ", ".join(f"{s} {t} (vanligen +{usual[s]})" for s, t in actual.items())
                msg = f"{day}/{direction}: tur {first} avviker: {det}"
                P(f"  AVVIKER {msg}")
                warnings.append(f"avvikande tur importerad som i PDF:en, kontrollera mot tryckt tabell: {msg}")

    # Datafiler
    P("")
    P("Datafiler:")
    for day in DAY_TYPES:
        norm = normalized(days[day])
        key = json.dumps(norm, sort_keys=True)
        reuse = find_reusable(norm, data_dir, day, f"ressel-city-{slug}-")
        if reuse:
            files_plan[day] = (reuse, "återanvänds", None)
            P(f"  {day:9} återanvänder {reuse}")
        elif key in pending:
            files_plan[day] = (pending[key], "delad", None)
            P(f"  {day:9} delar {pending[key]}")
        else:
            fn = f"ressel-city-{slug}-{day}.json"
            n_tours = len(days[day]["to_city"]["departures"][stop_sequence["to_city"][0]])
            exists = os.path.exists(os.path.join(data_dir, fn))
            data = {
                "metadata": {
                    "description": f"M/S Emelie {DAY_SV[day]} {title.lower()}",
                    "day_type": day,
                    "note": f"{fmt_sv(start)} - {fmt_sv(end)}. {n_tours} avgångar mot city. Källa: {source_name}",
                },
                **days[day],
            }
            files_plan[day] = (fn, "uppdateras" if exists else "skapas", data)
            pending[key] = fn
            P(f"  {day:9} {'uppdaterar' if exists else 'skapar'} {fn}")

    P("")
    P("holiday_rules:")
    hr = {}
    if no_traffic:
        hr["no_traffic"] = [d.isoformat() for d in no_traffic]
    if weekend:
        hr["weekend_schedule"] = [d.isoformat() for d in weekend]
    P(f"  no_traffic:       {', '.join(hr.get('no_traffic', [])) or '-'}")
    P(f"  weekend_schedule: {', '.join(hr.get('weekend_schedule', [])) or '-'}")
    for i in infos:
        P(f"  (info) {i}")

    season = {
        "name": season_name,
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "files": {d: files_plan[d][0] for d in DAY_TYPES},
    }
    if hr:
        season["holiday_rules"] = hr
    season["source_pdf"] = source_ref
    reused = sorted({v[0] for v in files_plan.values() if v[1] == "återanvänds"})
    season["note"] = (f"{fmt_sv(start)} - {fmt_sv(end)} ({source_name}). Importerad med tools/import_emelie.py."
                      + (f" Återanvänder {', '.join(reused)}." if reused else "")
                      + (" Avvikande tur(er) importerade som i PDF:en." if any(w.startswith("avvikande") for w in warnings) else ""))

    # Planera config-ändringen (även utan --write, för att kunna rapportera)
    source_entry = (f"CITY LINE {title} ({source_name})", source_name)
    new_text, changed, notes = update_config_text(cfg_text, season, source_entry, today)
    P("")
    P("Config (ressel-city-config.json):")
    for n in notes:
        P(f"  {n}" if changed else f"  (oförändrad) {n}")
    if not changed:
        P("  inga ändringar behövs, redan importerad")

    if warnings:
        P("")
        P("VARNINGAR:")
        for w in warnings:
            P(f"  - {w}")

    if not write:
        P("")
        P("Inget skrivet. Kör igen med --write för att skapa filerna.")
        return "\n".join(out) + "\n", 0

    for day in DAY_TYPES:
        fn, status, data = files_plan[day]
        if data is not None:
            with open(os.path.join(data_dir, fn), "w", encoding="utf-8") as f:
                f.write(dump_data_file(data))
    if changed:
        with open(os.path.join(data_dir, CONFIG_NAME), "w", encoding="utf-8") as f:
            f.write(new_text)
    P("")
    P("Skrivet. Kör validatorn...")
    rep = validate.validate(data_dir)
    for w in rep.warnings:
        P(f"  validator VARNING {w}")
    # Bara fel i city-data räknas mot importen; fel i t.ex. sjo-filer fanns redan
    mine = [e for e in rep.errors if e.startswith("ressel-city-")]
    for e in rep.errors:
        P(f"  validator FEL {e}" + ("" if e in mine else "  (befintligt, inte från importen)"))
    P(f"  validator: {len(rep.errors)} fel ({len(mine)} i city-data), {len(rep.warnings)} varningar")
    return "\n".join(out) + "\n", (1 if mine else 0)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Importera Emelie-tidtabell från Ressels PDF")
    ap.add_argument("pdf", help="sökväg eller URL till PDF:en")
    ap.add_argument("--write", action="store_true", help="skriv datafiler och config (annars bara sammanfattning)")
    ap.add_argument("--source", help="värde för source_pdf (default: URL om pdf är URL, annars filnamnet)")
    ap.add_argument("--skip-past", action="store_true",
                    help="hoppa över (utan fel) PDF:er vars period redan slutat, t.ex. gamla PDF:er på ressel.se")
    ap.add_argument("--data-dir", default=os.path.join(ROOT, "data"))
    args = ap.parse_args(argv)
    try:
        text, name, ref = fetch_pdf_text(args.pdf)
        out, code = run(text, name, args.source or ref, args.data_dir, args.write, skip_past=args.skip_past)
    except ImportError_ as e:
        print(f"FEL: {e}", file=sys.stderr)
        return 1
    sys.stdout.write(out)
    return code


if __name__ == "__main__":
    sys.exit(main())
