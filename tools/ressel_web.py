#!/usr/bin/env python3
"""Tolkar Ressels webbtabeller till en normaliserad struktur.

Två sidor, båda byggda med TablePress (en `<table>` per tabell):

  * https://ressel.se/emelie-trafiken/     (linjen `city`, M/S Emelie)
  * https://ressel.se/sjostadstrafiken/    (linjen `sjo`, gratis)

Python 3, bara stdlib (html.parser). Modulen hämtar inget själv, se
tools/sync_ressel.py. Allt som inte går att tolka ger `WebParseError` med ett
tydligt meddelande; ogiltiga tider (t.ex. tryckfelet "12:80") importeras
aldrig tyst.

Normaliserad form, city:
    [{"start": date, "end": date,
      "days": {"weekday"|"saturday"|"sunday": {"to_city"|"from_city":
              {brygga: [(tid "HH:MM", endast_avstigning bool)]}}}}]
sjo:
    [{"start": date, "end": date,
      "stops": {brygga: {"weekday": ["HH:MM"], "weekend": ["HH:MM"]}}}]
"""

import os
import re
import sys
import unicodedata
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_emelie as imp  # noqa: E402  (parse_period, nfc)
import validate  # noqa: E402

EMELIE_URL = "https://ressel.se/emelie-trafiken/"
SJO_URL = "https://ressel.se/sjostadstrafiken/"
USER_AGENT = "ressel-static-check/1.0"


class WebParseError(Exception):
    pass


def clean(s):
    """NFC, nbsp/tabbar/radbrytningar -> ett mellanslag, trimmad."""
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", s)).strip()


# === HTML -> tabeller =======================================================

class _TableParser(HTMLParser):
    """Samlar TablePress-tabeller, deras beskrivning (period) och flikrubriker."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.tabs = []
        self.tab_titles = {}   # knapp-id -> rubrik
        self._button = None
        self._panel = None
        self.descriptions = {}
        self._table = None
        self._section = None
        self._row = None
        self._cell = None      # (tagg, [text])
        self._span = None      # (typ, nyckel, [text])

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = (a.get("class") or "").split()
        if tag == "button":
            self._button = a.get("id")
        elif tag == "div" and a.get("role") == "tabpanel":
            self._panel = a.get("aria-labelledby")
        if tag == "span":
            sid = a.get("id") or ""
            if sid.endswith("-description"):
                self._span = ("desc", sid, [])
            elif "e-n-tab-title-text" in classes:
                self._span = ("tab", None, [])
        elif tag == "table" and self._table is None:
            self._table = {"id": a.get("id") or "", "classes": classes,
                           "describedby": a.get("aria-describedby") or "",
                           "panel": self._panel, "th": [], "rows": []}
        elif self._table is not None:
            if tag in ("thead", "tbody", "tfoot"):
                self._section = tag
            elif tag == "tr":
                self._row = []
            elif tag in ("td", "th") and self._row is not None:
                self._cell = (tag, [])
            elif tag == "br" and self._cell is not None:
                self._cell[1].append(" ")

    def handle_endtag(self, tag):
        if tag == "span" and self._span is not None:
            kind, key, parts = self._span
            text = clean("".join(parts))
            if kind == "desc":
                self.descriptions[key] = text
            elif text:
                self.tabs.append(text)
                if self._button:
                    self.tab_titles[self._button] = text
            self._span = None
        elif self._table is not None:
            if tag in ("td", "th") and self._cell is not None:
                ctag, parts = self._cell
                text = clean("".join(parts))
                if self._section == "thead" and ctag == "th":
                    self._table["th"].append(text)
                elif self._section == "tbody" and self._row is not None:
                    self._row.append(text)
                self._cell = None
            elif tag == "tr" and self._row is not None:
                if self._section == "tbody":
                    self._table["rows"].append(self._row)
                self._row = None
            elif tag == "table":
                self.tables.append(self._table)
                self._table = None
                self._section = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell[1].append(data)
        if self._span is not None:
            self._span[2].append(data)


def parse_tables(html):
    p = _TableParser()
    p.feed(html)
    p.close()
    for t in p.tables:
        t["tab"] = p.tab_titles.get(t["panel"])
    for t in p.tables:
        t["description"] = p.descriptions.get(t["describedby"], "")
    return p.tables, p.tabs


def _period_of(table, label):
    desc = table["description"]
    if not desc:
        raise WebParseError(f"{label}: tabellen {table['id']!r} saknar periodbeskrivning")
    try:
        return imp.parse_period(desc)
    except imp.ImportError_ as e:
        raise WebParseError(f"{label}: tabellen {table['id']!r}: {e} (beskrivning {desc!r})")


# === Emelie =================================================================

TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})(\*?)$")
DAY_RE = re.compile(r"(Måndag\s*[-–]\s*fredag|Lördag|Söndag)", re.I)
DAY_KEYS = {"m": "weekday", "l": "saturday", "s": "sunday"}


def _parse_emelie_header(header, table_id):
    if not header:
        raise WebParseError(f"Emelie-tabell {table_id!r} saknar rubrik")
    head = clean(header)
    dm = DAY_RE.search(head)
    if not dm:
        raise WebParseError(f"Emelie-tabell {table_id!r}: hittar ingen dagtyp i rubriken {head!r}")
    day = DAY_KEYS[dm.group(1)[0].lower()]
    # Riktning = vilken ände som nämns först; '>' saknas ibland i rubriken
    body = head.split(":", 1)[-1]
    ih, inb = body.find("Hammarby"), body.find("Nybroplan")
    if ih < 0 or inb < 0:
        raise WebParseError(f"Emelie-tabell {table_id!r}: kan inte avgöra riktning i rubriken {head!r}")
    return day, ("to_city" if ih < inb else "from_city")


def _parse_time_row(text, ctx):
    times = []
    for tok in text.split():
        m = TIME_RE.match(tok)
        if not m:
            raise WebParseError(f"{ctx}: oväntat värde {tok!r} i tidsraden")
        h, mi = int(m.group(1)), int(m.group(2))
        if h > 23 or mi > 59:
            raise WebParseError(f"{ctx}: ogiltig tid {tok!r} (tryckfel på ressel.se?)")
        times.append((f"{h:02d}:{mi:02d}", bool(m.group(3))))
    return times


def _parse_emelie_table(t, stop_sequence, known, start, end):
    day, direction = _parse_emelie_header(t["th"][0] if t["th"] else "", t["id"])
    ctx0 = f"Emelie {start}–{end} {day}/{direction}"
    rows, stop = {}, None
    for r in t["rows"]:
        text = clean(r[0]) if r else ""
        if not text:
            continue
        if not text[0].isdigit():
            if stop is not None:
                raise WebParseError(f"{ctx0}: {stop} saknar tidsrad")
            stop = text
            if stop not in known:
                raise WebParseError(f"{ctx0}: okänd brygga {stop!r} (inte i stop_sequence)")
            if stop in rows:
                raise WebParseError(f"{ctx0}: {stop} förekommer två gånger")
            continue
        if stop is None:
            raise WebParseError(f"{ctx0}: tidsrad utan föregående bryggnamn: {text[:60]!r}")
        rows[stop] = _parse_time_row(text, f"{ctx0} {stop}")
        stop = None
    if stop is not None:
        raise WebParseError(f"{ctx0}: {stop} saknar tidsrad")
    seq = stop_sequence[direction]
    missing = [s for s in seq if s not in rows]
    if missing:
        raise WebParseError(f"{ctx0}: bryggor saknas {missing}")
    extra = [s for s in rows if s not in seq]
    if extra:
        raise WebParseError(f"{ctx0}: bryggor som inte hör till riktningen: {extra}")
    counts = {s: len(v) for s, v in rows.items()}
    if len(set(counts.values())) != 1:
        raise WebParseError(f"{ctx0}: olika antal tider per brygga {counts}")
    for s, v in rows.items():
        mins = [validate.to_min(x[0]) for x in v]
        if mins != sorted(set(mins)):
            raise WebParseError(f"{ctx0} {s}: tiderna är inte stigande")
    return day, direction, rows


def parse_emelie(html, stop_sequence, today=None, errors=None):
    """Alla perioder på emelie-trafiken, sorterade på start.

    today (date): perioder som slutat före idag hoppas över helt, utan tolkning
    (gamla tabeller har tryckfel, t.ex. "12:80").
    errors (list): om angiven samlas tolkningsfel per period här och perioden
    utelämnas, i stället för att första felet kastas som WebParseError.
    """
    tables, _ = parse_tables(html)
    tables = [t for t in tables if "tidtabell-emelie" in t["classes"]]
    if not tables:
        raise WebParseError("Emelie-sidan: hittar inga tidtabeller (class tidtabell-emelie), har sidan ändrat struktur?")
    known = {imp.nfc(s) for d in stop_sequence.values() for s in d}
    periods, failed = {}, set()
    for t in tables:
        start, end = _period_of(t, "Emelie-sidan")
        if today is not None and end < today:
            continue
        try:
            day, direction, rows = _parse_emelie_table(t, stop_sequence, known, start, end)
            per = periods.setdefault((start, end), {})
            if direction in per.setdefault(day, {}):
                raise WebParseError(f"Emelie {start}–{end} {day}/{direction}: tabellen förekommer två gånger")
            per[day][direction] = rows
        except WebParseError as e:
            if errors is None:
                raise
            failed.add((start, end))
            errors.append(str(e))
    out = []
    for (start, end), days in sorted(periods.items()):
        if (start, end) in failed:
            continue
        try:
            for day in ("weekday", "saturday", "sunday"):
                for direction in ("to_city", "from_city"):
                    if direction not in days.get(day, {}):
                        raise WebParseError(f"Emelie {start}–{end}: {day}/{direction} saknas")
        except WebParseError as e:
            if errors is None:
                raise
            errors.append(str(e))
            continue
        out.append({"start": start, "end": end, "days": days})
    return out


def pdf_links(html):
    """PDF-länkar med 'Emelie' i namnet på sidan, unika och i sidans ordning."""
    seen, out = set(), []
    for m in re.finditer(r'https://ressel\.se/wp-content/uploads/[^"\'<>\s]*Emelie[^"\'<>\s]*\.pdf', html):
        if m.group(0) not in seen:
            seen.add(m.group(0))
            out.append(m.group(0))
    return out


# === Sjöstadstrafiken =======================================================

HOUR_RE = re.compile(r"^(\d{1,2}):$")
MIN_RE = re.compile(r"^\d{2}$")


def _parse_sjo_cell(text, ctx):
    if not text:
        return None, []
    toks = text.split()
    m = HOUR_RE.match(toks[0])
    if not m:
        raise WebParseError(f"{ctx}: förväntade timme ('HH:'), fick {toks[0]!r}")
    h = int(m.group(1))
    if h > 23:
        raise WebParseError(f"{ctx}: ogiltig timme {toks[0]!r}")
    times = []
    for mm in toks[1:]:
        if not MIN_RE.match(mm) or int(mm) > 59:
            raise WebParseError(f"{ctx}: ogiltig minut {mm!r} efter {toks[0]}")
        times.append(f"{h:02d}:{mm}")
    return h, times


def parse_sjo(html, stop_sequence):
    """Perioder på sjostadstrafiken. Tider dedupliceras (Ressel har "22:" två gånger)."""
    tables, tabs = parse_tables(html)
    tables = [t for t in tables if "tidtabell-sjostadstrafiken" in t["classes"]]
    if not tables:
        raise WebParseError("Sjö-sidan: hittar inga tidtabeller (class tidtabell-sjostadstrafiken), har sidan ändrat struktur?")
    names = [imp.nfc(t["tab"]) if t["tab"] else None for t in tables]
    if None in names:
        # äldre/enklare sidor: en tabell per flik i ordning
        names = [imp.nfc(x) for x in tabs]
        if len(names) != len(tables):
            raise WebParseError(f"Sjö-sidan: {len(tables)} tabeller men {len(names)} flikrubriker, kan inte koppla tabell till brygga")
    periods = {}
    for name, t in zip(names, tables):
        if name not in stop_sequence:
            raise WebParseError(f"Sjö-sidan: okänd brygga {name!r} (stop_sequence {stop_sequence})")
        start, end = _period_of(t, "Sjö-sidan")
        cols = []
        for h in t["th"]:
            hl = h.lower()
            if hl.startswith("måndag"):
                cols.append("weekday")
            elif hl.startswith("lördag"):
                cols.append("weekend")
            else:
                raise WebParseError(f"Sjö {name}: okänd kolumnrubrik {h!r}")
        if sorted(cols) != ["weekday", "weekend"]:
            raise WebParseError(f"Sjö {name}: förväntade kolumnerna Måndag–fredag och Lördag–söndag, fick {t['th']}")
        res = {c: [] for c in cols}
        last_hour = {c: None for c in cols}
        for r in t["rows"]:
            if len(r) != len(cols):
                raise WebParseError(f"Sjö {name}: rad med {len(r)} celler, förväntade {len(cols)}: {r}")
            for c, text in zip(cols, r):
                ctx = f"Sjö {name} {start}–{end} {c}"
                h, times = _parse_sjo_cell(text, ctx)
                if h is None:
                    continue
                prev = last_hour[c]
                # timmarna ska stiga; 00:–02: efter kvällen är nattur och ligger sist
                if prev is not None and h < prev and not (h < 3 and prev >= 12):
                    raise WebParseError(f"{ctx}: timme {h:02d}: kommer efter {prev:02d}:")
                last_hour[c] = h
                for tt in times:
                    if tt not in res[c]:   # dubblettraden "22:" ger samma tider
                        res[c].append(tt)
        per = periods.setdefault((start, end), {})
        if name in per:
            raise WebParseError(f"Sjö {name} {start}–{end}: tabellen förekommer två gånger")
        per[name] = res
    out = []
    for (start, end), stops in sorted(periods.items()):
        missing = [s for s in stop_sequence if s not in stops]
        if missing:
            raise WebParseError(f"Sjö {start}–{end}: bryggor saknas {missing}")
        out.append({"start": start, "end": end, "stops": {s: stops[s] for s in stop_sequence}})
    return out
