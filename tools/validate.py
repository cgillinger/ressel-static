#!/usr/bin/env python3
"""Validerar tidtabellsdata för båda linjerna (city och sjo).

    python3 tools/validate.py [--data-dir data] [--quiet]

Exit 0 = inga fel (varningar kan finnas), exit 1 = minst ett fel.

Kontrollerar:
  * JSON parsar
  * filer som refereras i season_mapping[].files och exceptions[].files finns
  * perioder är giltiga och överlappar inte (luckor ger varning)
  * tider är HH:MM och strikt stigande per brygga (se NATTVRIDNING nedan)
  * alla bryggor i en riktning har lika många tider, och motsvarar stop_sequence
  * disembark_only är en delmängd av departures
  * holiday-datum är giltiga ISO-datum och ligger inom säsongens period

Stödda filstrukturer (hittas generiskt via nyckeln "departures"):
  * sjo:  {"departures": {brygga: [...]}}
  * city, platt:   {"to_city": {"departures": {...}}, "from_city": {...}}
  * city, nästlad: {"to_city": {"morning"|"lunch"|"afternoon": {"departures": ...}}}

NATTVRIDNING: en tid under 03:00 direkt efter en tid från 12:00 eller senare
räknas som efter midnatt (sjo har t.ex. "00:05" sist i dagens lista, se
KNOWN-BUGS.md). Gränsen speglar config.dayRolloverTime i js/app.js. I övrigt
måste tiderna stiga strikt.
"""

import argparse
import json
import os
import re
import sys
from datetime import date, timedelta

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ROLLOVER_MIN = 3 * 60      # som config.dayRolloverTime i js/app.js
WRAP_AFTER_MIN = 12 * 60   # föregående tid måste vara minst så sen för att vridningen ska gälla

CONFIGS = {
    "city": "ressel-city-config.json",
    "sjo": "ressel-sjo-config.json",
}
EXPECTED_FILE_KEYS = {
    "city": {"weekday", "saturday", "sunday"},
    "sjo": {"weekday", "weekend"},
}


def to_min(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def parse_iso(s):
    if not isinstance(s, str) or not DATE_RE.match(s):
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def collect_blocks(obj, path=()):
    """Returnerar [(sökväg, block)] för varje dict som har "departures"."""
    found = []
    if isinstance(obj, dict):
        if isinstance(obj.get("departures"), dict):
            found.append((path, obj))
        for k, v in obj.items():
            if k in ("departures", "disembark_only", "metadata"):
                continue
            found.extend(collect_blocks(v, path + (k,)))
    return found


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)


def load_json(path, rep):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        rep.error(f"{os.path.basename(path)}: filen saknas")
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        rep.error(f"{os.path.basename(path)}: ogiltig JSON ({e})")
    return None


def check_times(name, label, brygga, times, rep):
    """Format + strikt stigande (med nattvridning). Returnerar True om listan är hel."""
    if not isinstance(times, list):
        rep.error(f"{name}: {label} {brygga}: ska vara en lista")
        return False
    ok = True
    prev = None
    wrapped = False
    for t in times:
        if not isinstance(t, str) or not TIME_RE.match(t):
            rep.error(f"{name}: {label} {brygga}: ogiltig tid {t!r}")
            ok = False
            continue
        m = to_min(t)
        if prev is not None and not wrapped and m < ROLLOVER_MIN and prev >= WRAP_AFTER_MIN:
            wrapped = True
        if wrapped:
            m += 1440
        if prev is not None and m <= prev:
            rep.error(f"{name}: {label} {brygga}: {t} är inte senare än föregående tid")
            ok = False
        prev = m
    return ok


def check_data_file(path, name, expected_stops, rep):
    data = load_json(path, rep)
    if data is None:
        return
    blocks = collect_blocks(data)
    if not blocks:
        rep.error(f"{name}: hittar inga \"departures\"")
        return
    all_times = {}  # (riktning, brygga) -> set(tider) över alla block
    for bpath, block in blocks:
        direction = bpath[0] if bpath and bpath[0] in ("to_city", "from_city") else ""
        label = "/".join(bpath) or "departures"
        deps = block["departures"]
        oh = block.get("operating_hours")
        if oh is not None:
            for k in ("start", "end"):
                if not (isinstance(oh, dict) and isinstance(oh.get(k), str) and TIME_RE.match(oh[k])):
                    rep.error(f"{name}: {label}.operating_hours.{k} är inte HH:MM")
        lengths = {}
        for brygga, times in deps.items():
            if check_times(name, label, brygga, times, rep):
                lengths[brygga] = len(times)
                all_times.setdefault((direction, brygga), set()).update(times)
        # Lika antal tider per brygga gäller bara Emelie (city), där varje kolumn är
        # en tur. sjo trafikerar bryggorna oberoende av varandra: Henriksdalsbryggan
        # har t.ex. extra avgångar 07:00/09:00/18:00 på vardagar (bekräftat mot
        # ressel.se, period 17 aug 2026 - 25 jun 2027), så där är olika antal korrekt.
        if direction and len(set(lengths.values())) > 1:
            rep.error(f"{name}: {label}: bryggorna har olika antal tider {lengths}")
        exp = expected_stops.get(direction) if expected_stops else None
        if exp is not None and set(exp) != set(deps):
            saknas = sorted(set(exp) - set(deps))
            extra = sorted(set(deps) - set(exp))
            rep.error(f"{name}: {label}: bryggor stämmer inte med stop_sequence (saknas {saknas}, extra {extra})")

    dis = data.get("disembark_only")
    if dis is not None:
        if not isinstance(dis, dict):
            rep.error(f"{name}: disembark_only ska vara ett objekt")
            return
        for direction, stops in dis.items():
            if not isinstance(stops, dict):
                continue
            for brygga, times in stops.items():
                if not isinstance(times, list):
                    # nästlad variant (morning/lunch/afternoon) – slå ihop
                    if isinstance(times, dict):
                        for sub in times.values():
                            _check_dis(name, direction, brygga, sub, all_times, rep)
                    continue
                _check_dis(name, direction, brygga, times, all_times, rep)


def _check_dis(name, direction, brygga, times, all_times, rep):
    if not isinstance(times, list):
        return
    avail = all_times.get((direction, brygga))
    if avail is None:
        avail = all_times.get(("", brygga))
    if avail is None:
        if times:
            rep.error(f"{name}: disembark_only.{direction}.{brygga} saknar motsvarande departures")
        return
    for t in times:
        if t not in avail:
            rep.error(f"{name}: disembark_only.{direction}.{brygga}: {t} finns inte i departures")


def check_holidays(cfg_name, owner, rules, period, rep):
    if not isinstance(rules, dict):
        return
    for key, val in rules.items():
        if key.startswith("_") or not isinstance(val, list):
            continue
        if key not in ("no_traffic", "weekend_schedule"):
            continue
        for d in val:
            pd = parse_iso(d)
            if pd is None:
                rep.error(f"{cfg_name}: {owner}: holiday_rules.{key}: ogiltigt datum {d!r}")
            elif period and not (period[0] <= pd <= period[1]):
                rep.error(f"{cfg_name}: {owner}: holiday_rules.{key}: {d} ligger utanför säsongens period")


def check_config(kind, data_dir, rep, checked_files):
    fname = CONFIGS[kind]
    path = os.path.join(data_dir, fname)
    cfg = load_json(path, rep)
    if cfg is None:
        return
    md = cfg.get("_metadata", {})
    if not isinstance(md.get("version"), str) or not re.match(r"^\d+\.\d+\.\d+$", md.get("version", "")):
        rep.error(f"{fname}: _metadata.version saknas eller är inte x.y.z")

    # Förväntade bryggor per riktning
    stop_seq = cfg.get("service_configuration", {}).get("stop_sequence")
    if isinstance(stop_seq, dict):
        expected = stop_seq
    elif isinstance(stop_seq, list):
        expected = {"": stop_seq}
    else:
        expected = None

    seasons = cfg.get("season_mapping")
    if not isinstance(seasons, list) or not seasons:
        rep.error(f"{fname}: season_mapping saknas eller är tom")
        seasons = []

    ranges = []
    referenced = set()
    for i, s in enumerate(seasons):
        sname = s.get("name", f"#{i}")
        owner = f"säsong '{sname}'"
        per = s.get("period", {})
        ps, pe = parse_iso(per.get("start")), parse_iso(per.get("end"))
        if ps is None or pe is None:
            rep.error(f"{fname}: {owner}: period.start/end saknas eller är ogiltiga")
            period = None
        elif ps > pe:
            rep.error(f"{fname}: {owner}: period.start är efter period.end")
            period = None
        else:
            period = (ps, pe)
            ranges.append((ps, pe, sname))
        files = s.get("files")
        if not isinstance(files, dict):
            rep.error(f"{fname}: {owner}: files saknas")
        else:
            missing_keys = EXPECTED_FILE_KEYS[kind] - set(files)
            if missing_keys and not s.get("maintenance_mode"):
                rep.error(f"{fname}: {owner}: files saknar {sorted(missing_keys)}")
            for key, fn in files.items():
                if fn:
                    referenced.add(fn)
        if kind == "city":
            check_holidays(fname, owner, s.get("holiday_rules"), period, rep)

    if kind == "sjo":
        # rotnivå: gäller alla säsonger, så det räcker att datumen är giltiga
        check_holidays(fname, "rotnivå", cfg.get("holiday_rules"), None, rep)

    for i, ex in enumerate(cfg.get("exceptions") or []):
        eid = ex.get("id", f"#{i}")
        per = ex.get("period", {})
        ps, pe = parse_iso(per.get("start")), parse_iso(per.get("end"))
        if ps is None or pe is None or ps > pe:
            rep.error(f"{fname}: exception '{eid}': ogiltig period")
        for key, fn in (ex.get("files") or {}).items():
            if fn:
                referenced.add(fn)

    # Överlapp och luckor
    ranges.sort()
    for (a_s, a_e, a_n), (b_s, b_e, b_n) in zip(ranges, ranges[1:]):
        if b_s <= a_e:
            rep.error(f"{fname}: perioderna överlappar: '{a_n}' ({a_s}–{a_e}) och '{b_n}' ({b_s}–{b_e})")
        elif b_s > a_e + timedelta(days=1):
            rep.warn(f"{fname}: lucka mellan '{a_n}' (slutar {a_e}) och '{b_n}' (börjar {b_s})")

    for fn in sorted(referenced):
        p = os.path.join(data_dir, fn)
        if not os.path.exists(p):
            rep.error(f"{fname}: refererar {fn} som inte finns")
            continue
        if (kind, fn) in checked_files:
            continue
        checked_files.add((kind, fn))
        check_data_file(p, fn, expected, rep)


def validate(data_dir):
    rep = Report()
    checked = set()
    for kind in ("city", "sjo"):
        check_config(kind, data_dir, rep, checked)
    return rep


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    default_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
    ap.add_argument("--data-dir", default=default_dir)
    ap.add_argument("--quiet", action="store_true", help="skriv bara fel och varningar")
    args = ap.parse_args(argv)
    rep = validate(args.data_dir)
    for w in rep.warnings:
        print(f"VARNING {w}")
    for e in rep.errors:
        print(f"FEL     {e}")
    if not args.quiet or rep.errors or rep.warnings:
        print(f"{len(rep.errors)} fel, {len(rep.warnings)} varningar")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
