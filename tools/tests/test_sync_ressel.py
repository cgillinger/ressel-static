"""Tester för tools/ressel_web.py och tools/sync_ressel.py mot fixtures av Ressels webbsidor.

Körs från repots rot:  python3 -m unittest
Fixtures: tools/tests/fixtures/ressel-emelie-trafiken.html, ressel-sjostadstrafiken.html
(curl 2026-11-08) samt emelie-vinter-2026.txt (pdftotext av vinter-PDF:en).
"""

import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.normpath(os.path.join(HERE, ".."))
ROOT = os.path.normpath(os.path.join(TOOLS, ".."))
sys.path.insert(0, TOOLS)

import import_emelie as imp  # noqa: E402
import ressel_web as web  # noqa: E402
import sync_ressel as sync  # noqa: E402
import validate  # noqa: E402

FIX = os.path.join(HERE, "fixtures")
PDF_NAME = "Tidtabell-Emelie-A4-VINTER-2026.pdf"
TODAY = date(2026, 11, 9)   # dagen då autumn-perioden (med tryckfelet 12:80) passerat


def rd(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def jload(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def jdump(obj, p):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


EMELIE = rd(os.path.join(FIX, "ressel-emelie-trafiken.html"))
SJO = rd(os.path.join(FIX, "ressel-sjostadstrafiken.html"))
PDF_TEXT = rd(os.path.join(FIX, "emelie-vinter-2026.txt"))
PDF = [(PDF_TEXT, PDF_NAME, "https://example.invalid/" + PDF_NAME)]


def table_snippets(html, ids):
    """[(beskrivningsspan + tabell)] för givna tablepress-id:n."""
    out = []
    for i in ids:
        m = re.search(r'<span id="tablepress-%d-description".*?</table>' % i, html, re.S)
        out.append(m.group(0))
    return out


def with_extra_emelie_period(html, period_text, edit=None):
    """Lägger till en kopia av vinterns sex tabeller med annan period (och ev. ändrad vardagstid)."""
    extra = []
    for n, snip in zip((1, 2, 3, 4, 6, 7), table_snippets(html, (1, 2, 3, 4, 6, 7))):
        snip = re.sub(r"tablepress-(\d+)", r"tablepress-9\1", snip)
        snip = snip.replace("9 november 2026 - 29 mars 2027", period_text)
        if edit and n == 1:
            snip = snip.replace(*edit, 1)
        extra.append(snip)
    return html.replace("</body>", "\n".join(extra) + "\n</body>")


def make_sjo_html(periods):
    """periods: [(beskrivning, {brygga: {"weekday": [...], "weekend": [...]}})]."""
    stops = list(periods[0][1])
    tabs = "".join(f'<button id="tab{i}"><span class="e-n-tab-title-text">{s}</span></button>' for i, s in enumerate(stops))
    tables = []
    n = 100
    for i, stop in enumerate(stops):
        tables.append(f'<div role="tabpanel" aria-labelledby="tab{i}">')
        for desc, data in periods:
            n += 1
            cols = {}
            for c in ("weekday", "weekend"):
                byhour = {}
                for t in data[stop][c]:
                    byhour.setdefault(int(t[:2]), []).append(t[3:])
                cols[c] = byhour
            hours = sorted(set(cols["weekday"]) | set(cols["weekend"]), key=lambda h: (h < 3, h))
            rows = ""
            for h in hours:
                cells = ""
                for c in ("weekday", "weekend"):
                    ms = cols[c].get(h)
                    cells += "<td>" + (f"{h:02d}:\t" + "\t".join(ms) if ms else "") + "</td>"
                rows += f"<tr>{cells}</tr>\n"
            tables.append(
                f'<span id="tablepress-{n}-description">{desc}</span>'
                f'<table id="tablepress-{n}" class="tablepress tidtabell-sjostadstrafiken" aria-describedby="tablepress-{n}-description">'
                f"<thead><tr><th>Måndag – fredag</th><th>Lördag – söndag</th></tr></thead><tbody>{rows}</tbody></table>")
        tables.append("</div>")
    # Tabellerna grupperas per brygga (som på sidan): en period per brygga i tur och ordning
    return f"<html><body>{tabs}{''.join(tables)}</body></html>"


class DataCase(unittest.TestCase):
    """Arbetskopia av data/ för varje test."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="sync-test-")
        self.data = os.path.join(self.tmp, "data")
        shutil.copytree(os.path.join(ROOT, "data"), self.data)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def sync(self, emelie=EMELIE, sjo=SJO, pdfs=PDF, write=False, today=TODAY):
        return sync.run(emelie, sjo, pdfs, self.data, write, today)

    def cfg(self, name):
        with open(os.path.join(self.data, name), encoding="utf-8") as f:
            return json.load(f)

    def snapshot(self):
        snap = {}
        for fn in sorted(os.listdir(self.data)):
            snap[fn] = rd(os.path.join(self.data, fn))
        return snap


class AcceptanceTest(DataCase):
    """Nuvarande data är verifierad mot webb och PDF: inga tidsändringar, inga varningar."""

    def test_no_changes_with_current_fixtures(self):
        out, code, _ = self.sync()
        self.assertEqual(code, 0, out)
        self.assertNotIn("ÄNDRADE TIDER", out)
        self.assertNotIn("NY SÄSONG", out)
        self.assertNotIn("VARNING", out)
        self.assertIn("Winter 2026-2027: oförändrad", out)
        self.assertIn("matchar ressel-sjo-weekday-standard.json och ressel-sjo-weekend.json", out)
        self.assertIn("city 0 ändring(ar)", out)

    def test_normalized_equal_per_file(self):
        stops = self.cfg(imp.CONFIG_NAME)["service_configuration"]["stop_sequence"]
        (per,) = web.parse_emelie(EMELIE, stops, TODAY)
        cfg = self.cfg(imp.CONFIG_NAME)
        season = next(s for s in cfg["season_mapping"] if s["period"]["start"] == "2026-11-09")
        for day in imp.DAY_TYPES:
            with open(os.path.join(self.data, season["files"][day]), encoding="utf-8") as f:
                cur = imp.normalized(json.load(f))
            self.assertEqual(cur, imp.normalized(imp.build_day(per["days"][day], stops)), day)

    def test_sjo_departures_equal_including_henriksdal_extras(self):
        sj = self.cfg(sync.SJO_CONFIG)["service_configuration"]["stop_sequence"]
        (per,) = web.parse_sjo(SJO, sj)
        for day, fn in (("weekday", "ressel-sjo-weekday-standard.json"), ("weekend", "ressel-sjo-weekend.json")):
            deps = self.cfg(fn)["departures"]
            self.assertEqual({s: per["stops"][s][day] for s in sj}, deps)
        self.assertEqual(len(per["stops"]["Henriksdalsbryggan"]["weekday"]), 69)   # Barnäng/Luma har 68
        self.assertEqual(len(per["stops"]["Barnängsbryggan"]["weekday"]), 68)
        self.assertTrue({"07:00", "09:00", "18:00"} <= set(per["stops"]["Henriksdalsbryggan"]["weekday"]))

    def test_duplicate_22_row_deduplicated(self):
        sj = self.cfg(sync.SJO_CONFIG)["service_configuration"]["stop_sequence"]
        (per,) = web.parse_sjo(SJO, sj)
        t = per["stops"]["Barnängsbryggan"]["weekday"]
        self.assertEqual(t.count("22:00"), 1)
        self.assertEqual(t[-1], "00:00")   # nattur sist

    def test_write_is_idempotent_and_only_adds_easter_sunday(self):
        out, code, changed = self.sync(write=True)
        self.assertEqual(code, 0, out)
        self.assertTrue(changed)   # Påskdagen 2027-03-28 saknades
        self.assertIn("2027-03-28 Påskdagen", out)
        sj = self.cfg(sync.SJO_CONFIG)
        old = jload(os.path.join(ROOT, "data", sync.SJO_CONFIG))
        added = set(sj["holiday_rules"]["weekend_schedule"]) - set(old["holiday_rules"]["weekend_schedule"])
        self.assertEqual(added, {"2027-03-28"})
        self.assertTrue(set(old["holiday_rules"]["weekend_schedule"]) <= set(sj["holiday_rules"]["weekend_schedule"]))
        self.assertEqual(sj["season_mapping"], old["season_mapping"])
        self.assertEqual(sj["_metadata"]["version"], "8.4.0")
        before = self.snapshot()
        out2, code2, changed2 = self.sync(write=True)
        self.assertEqual((code2, changed2), (0, False), out2)
        self.assertEqual(self.snapshot(), before)


class ChangedTimeTest(DataCase):
    def test_changed_time_gives_diff_and_in_place_rewrite(self):
        i = EMELIE.index('id="tablepress-1"')
        mod = EMELIE[:i] + EMELIE[i:].replace("07:14", "07:15", 1) + ""
        out, code, _ = self.sync(emelie=mod)
        self.assertEqual(code, 0, out)
        self.assertIn("Winter 2026-2027 weekday (ressel-city-vinter-2026-2027-weekday.json): ÄNDRADE TIDER", out)
        self.assertIn("till city Barnängsbryggan: +07:15 -07:14", out)
        self.assertIn("skriver om ressel-city-vinter-2026-2027-weekday.json", out)
        self.assertIn("PDF och webb skiljer", out)   # PDF:en säger fortfarande 07:14, webben vinner
        self.assertNotIn("saturday (", out)
        before_sat = rd(os.path.join(self.data, "ressel-city-vinter-2026-2027-saturday.json"))
        out, code, _ = self.sync(emelie=mod, write=True)
        self.assertEqual(code, 0, out)
        d = self.cfg("ressel-city-vinter-2026-2027-weekday.json")
        self.assertEqual(d["to_city"]["departures"]["Barnängsbryggan"][0], "07:15")
        self.assertEqual(d["to_city"]["operating_hours"]["start"], "07:15")
        self.assertEqual(rd(os.path.join(self.data, "ressel-city-vinter-2026-2027-saturday.json")), before_sat)
        self.assertEqual(self.cfg(imp.CONFIG_NAME)["_metadata"]["version"], "13.6.0")
        _, code2, changed2 = self.sync(emelie=mod, write=True)
        self.assertEqual(code2, 0)
        self.assertFalse(changed2)
        out3, _, _ = self.sync(emelie=mod)
        self.assertNotIn("ÄNDRADE TIDER", out3)

    def test_shared_file_is_never_changed_for_other_seasons(self):
        # Autumn 2026 (late) delar ressel-city-weekday-winter.json med andra säsonger
        stops = self.cfg(imp.CONFIG_NAME)["service_configuration"]["stop_sequence"]
        errs = []
        pers = web.parse_emelie(EMELIE, stops, date(2026, 11, 8), errs)
        self.assertEqual(len(errs), 1)    # lördagstabellen med 12:80
        self.assertTrue(all(p["start"] != date(2026, 9, 21) for p in pers))

    def test_sjo_changed_time_makes_new_file_and_season(self):
        sj = self.cfg(sync.SJO_CONFIG)["service_configuration"]["stop_sequence"]
        (per,) = web.parse_sjo(SJO, sj)
        data = {s: dict(per["stops"][s]) for s in sj}
        data["Lumabryggan"]["weekday"] = [t for t in data["Lumabryggan"]["weekday"] if t != "12:25"]
        # lika många tider behövs inte för sjo (Henriksdal har fler), så synken tål det
        html = make_sjo_html([("17 augusti 2026 – 25 juni 2027", data)])
        out, code, _ = self.sync(sjo=html, write=True)
        self.assertEqual(code, 0, out)
        self.assertIn("Lumabryggan: -12:25", out)
        cfg = self.cfg(sync.SJO_CONFIG)
        names = [s["name"] for s in cfg["season_mapping"]]
        self.assertEqual(len(names), 6, names)   # ny säsong + återöppning efter 2027-06-25
        new = cfg["season_mapping"][-2]
        self.assertEqual(new["period"]["end"], "2027-06-25")
        self.assertNotEqual(new["files"]["weekday"], "ressel-sjo-weekday-standard.json")
        self.assertEqual(new["files"]["weekend"], "ressel-sjo-weekend.json")
        self.assertEqual(cfg["season_mapping"][-1]["files"]["weekday"], "ressel-sjo-weekday-standard.json")
        self.assertEqual(cfg["season_mapping"][-1]["period"]["end"], "2099-12-31")
        std = self.cfg("ressel-sjo-weekday-standard.json")
        self.assertIn("12:25", std["departures"]["Lumabryggan"])   # delad fil orörd
        self.assertEqual(validate.validate(self.data).errors, [])


class SjoSummerTest(DataCase):
    def test_new_summer_period_caps_and_reopens(self):
        sj = self.cfg(sync.SJO_CONFIG)["service_configuration"]["stop_sequence"]
        (per,) = web.parse_sjo(SJO, sj)
        summer = {s: {"weekday": self.cfg("ressel-sjo-weekday-summer.json")["departures"][s],
                      "weekend": per["stops"][s]["weekend"]} for s in sj}
        html = make_sjo_html([("17 augusti 2026 – 25 juni 2027", per["stops"]),
                              ("26 juni 2027 – 15 augusti 2027", summer)])
        out, code, _ = self.sync(sjo=html, write=True)
        self.assertEqual(code, 0, out)
        self.assertIn("kapar", out)
        self.assertIn("ANTAGANDE", out)
        cfg = self.cfg(sync.SJO_CONFIG)
        sm = cfg["season_mapping"]
        self.assertEqual(len(sm), 7)
        capped, summer_s, reopened = sm[-3], sm[-2], sm[-1]
        self.assertEqual((capped["period"]["start"], capped["period"]["end"]), ("2026-08-17", "2027-06-25"))
        self.assertEqual((summer_s["period"]["start"], summer_s["period"]["end"]), ("2027-06-26", "2027-08-15"))
        self.assertEqual(summer_s["name"], "Sommar 2027 (utan rusningstid)")
        self.assertEqual(summer_s["files"], {"weekday": "ressel-sjo-weekday-summer.json", "weekend": "ressel-sjo-weekend.json"})
        self.assertEqual((reopened["period"]["start"], reopened["period"]["end"]), ("2027-08-16", "2099-12-31"))
        self.assertEqual(reopened["files"], capped["files"])
        self.assertEqual(validate.validate(self.data).errors, [])
        # idempotent
        before = self.snapshot()
        out2, code2, changed2 = self.sync(sjo=html, write=True)
        self.assertEqual((code2, changed2), (0, False), out2)
        self.assertEqual(self.snapshot(), before)


class NewCityPeriodTest(DataCase):
    def test_new_period_without_pdf_creates_season_with_warning(self):
        html = with_extra_emelie_period(EMELIE, "30 mars 2027 - 18 juni 2027", ("07:14", "07:16"))
        out, code, _ = self.sync(emelie=html, write=True)
        self.assertEqual(code, 0, out)
        self.assertIn("NY SÄSONG", out)
        self.assertIn("ingen matchande PDF", out)
        self.assertIn("UTAN helgregler", out)
        cfg = self.cfg(imp.CONFIG_NAME)
        new = cfg["season_mapping"][-1]
        self.assertEqual(new["period"], {"start": "2027-03-30", "end": "2027-06-18"})
        self.assertNotIn("holiday_rules", new)
        self.assertEqual(new["source_pdf"], web.EMELIE_URL)
        w = self.cfg(new["files"]["weekday"])
        self.assertEqual(w["to_city"]["departures"]["Barnängsbryggan"][0], "07:16")
        # lördag/söndag identiska med vintern -> återanvänds
        self.assertEqual(new["files"]["saturday"], "ressel-city-vinter-2026-2027-saturday.json")
        self.assertEqual(new["files"]["sunday"], "ressel-city-vinter-2026-2027-sunday.json")
        self.assertEqual(validate.validate(self.data).errors, [])
        before = self.snapshot()
        out2, code2, changed2 = self.sync(emelie=html, write=True)
        self.assertEqual(code2, 0, out2)
        self.assertFalse(changed2, out2)
        self.assertEqual(self.snapshot(), before)

    def test_new_period_with_matching_pdf_gets_holiday_rules(self):
        # Ta bort vintern ur datan och låt synken skapa den från webb + PDF
        for fn in os.listdir(self.data):
            if fn.startswith("ressel-city-vinter-2026-2027-"):
                os.unlink(os.path.join(self.data, fn))
        p = os.path.join(self.data, imp.CONFIG_NAME)
        cfg = jload(p)
        orig = next(s for s in cfg["season_mapping"] if s["period"]["start"] == "2026-11-09")
        cfg["season_mapping"] = [s for s in cfg["season_mapping"] if s is not orig]
        jdump(cfg, p)
        out, code, _ = self.sync(write=True)
        self.assertEqual(code, 0, out)
        self.assertIn("NY SÄSONG Winter 2026-2027", out)
        new = next(s for s in self.cfg(imp.CONFIG_NAME)["season_mapping"] if s["period"]["start"] == "2026-11-09")
        self.assertEqual(new["holiday_rules"], orig["holiday_rules"])
        self.assertEqual(new["files"], orig["files"])
        self.assertIn("avvikande tur", out)   # 10:14-turen
        self.assertEqual(validate.validate(self.data).errors, [])


class ParseErrorTest(DataCase):
    def test_12_80_is_an_error(self):
        i = EMELIE.index('id="tablepress-1"')
        bad = EMELIE[:i] + EMELIE[i:].replace("07:14", "12:80", 1)
        stops = self.cfg(imp.CONFIG_NAME)["service_configuration"]["stop_sequence"]
        with self.assertRaises(web.WebParseError) as cm:
            web.parse_emelie(bad, stops, TODAY)
        self.assertIn("12:80", str(cm.exception))
        out, code, _ = self.sync(emelie=bad)
        self.assertEqual(code, 1)
        self.assertIn("FEL:", out)
        self.assertIn("12:80", out)

    def test_12_80_in_past_period_is_skipped(self):
        stops = self.cfg(imp.CONFIG_NAME)["service_configuration"]["stop_sequence"]
        pers = web.parse_emelie(EMELIE, stops, TODAY)    # autumn-perioden har passerat
        self.assertEqual([p["start"] for p in pers], [date(2026, 11, 9)])
        with self.assertRaises(web.WebParseError):
            web.parse_emelie(EMELIE, stops, date(2026, 11, 8))

    def test_unknown_structure_is_error(self):
        stops = self.cfg(imp.CONFIG_NAME)["service_configuration"]["stop_sequence"]
        with self.assertRaises(web.WebParseError):
            web.parse_emelie("<html><body>inget här</body></html>", stops, TODAY)
        with self.assertRaises(web.WebParseError):
            web.parse_sjo("<html><body></body></html>", ["Barnängsbryggan"])

    def test_header_without_arrow(self):
        # tablepress-1 har rubriken 'Hammarby Sjöstad Nybroplan' utan '>'
        stops = self.cfg(imp.CONFIG_NAME)["service_configuration"]["stop_sequence"]
        (per,) = web.parse_emelie(EMELIE, stops, TODAY)
        self.assertIn("Nybroplan", per["days"]["weekday"]["from_city"])
        self.assertIn("Nybroplan", per["days"]["weekday"]["to_city"])

    def test_bad_sjo_minute(self):
        sj = ["Barnängsbryggan", "Lumabryggan", "Henriksdalsbryggan"]
        bad = SJO.replace("06:\t00\t20\t40", "06:\t00\t75\t40", 1)
        with self.assertRaises(web.WebParseError):
            web.parse_sjo(bad, sj)


class HolidayTest(unittest.TestCase):
    def test_2027(self):
        h = sync.swedish_holidays(2027)
        self.assertEqual(sync.easter(2027), date(2027, 3, 28))
        by_name = {n: d for d, n in h.items()}
        self.assertEqual(by_name["Påskdagen"], date(2027, 3, 28))
        self.assertEqual(by_name["Långfredagen"], date(2027, 3, 26))
        self.assertEqual(by_name["Annandag påsk"], date(2027, 3, 29))
        self.assertEqual(by_name["Kristi himmelsfärdsdag"], date(2027, 5, 6))
        self.assertEqual(by_name["Midsommardagen"], date(2027, 6, 26))
        self.assertEqual(by_name["Alla helgons dag"], date(2027, 11, 6))
        self.assertEqual(len(h), 12)

    def test_2026_matches_existing_list(self):
        h = sync.swedish_holidays(2026)
        self.assertEqual(sync.easter(2026), date(2026, 4, 5))
        self.assertIn(date(2026, 5, 14), h)       # Kristi himmelsfärd
        self.assertIn(date(2026, 6, 20), h)       # midsommardagen
        self.assertIn(date(2026, 10, 31), h)      # alla helgons dag

    def test_next_year_is_added(self):
        tmp = tempfile.mkdtemp(prefix="sync-test-")
        try:
            data = os.path.join(tmp, "data")
            shutil.copytree(os.path.join(ROOT, "data"), data)
            out, code, changed = sync.run(EMELIE, SJO, PDF, data, True, date(2027, 1, 10))
            self.assertTrue(changed, out)
            sched = jload(os.path.join(data, sync.SJO_CONFIG))["holiday_rules"]["weekend_schedule"]
            for d in ("2028-01-01", "2028-04-14", "2028-04-16", "2028-05-25", "2028-06-24", "2028-12-25"):
                self.assertIn(d, sched)
            self.assertIn("2026-12-24", sched)   # aftnar rörs inte
            self.assertIn("2027-12-24", sched)
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()
